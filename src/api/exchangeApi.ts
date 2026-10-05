import { EXCHANGE_ACTION_FLOW, ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { OperationType } from '@/models/operationLog';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import type { CatalogSnapshot } from '@/types';

import { catalogApi } from './catalogApi';
import { itemApi } from './itemApi';
import { operationApi } from './operationApi';
import { sessionApi } from './sessionApi';
import { PermissionDeniedError } from '@/utils/errors';
import { storage } from '@/utils/storage';

const upsertExchange = async (userId: string, exchange: Exchange, retries = 3) => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const collection = await storage.getScoped<Exchange>('exchanges', userId);
    const existed = collection.rows.some((item) => item.id === exchange.id);
    try {
      await storage.compareSetScoped<Exchange>('exchanges', userId, collection.revision, (rows) => {
        if (existed) return rows.map((item) => (item.id === exchange.id ? exchange : item));
        return [exchange, ...rows];
      });
      return;
    } catch (error) {
      if (attempt === retries) throw error;
    }
  }
};

// 读取某用户视角的交换：本人发起 + 本人收到的并集。
const scopeRowsOf = (snapshot: CatalogSnapshot, userId: string) =>
  snapshot.exchanges.filter(
    (item) => item.from_user_id === userId || item.to_user_id === userId,
  );

export const exchangeApi = {
  async listMine(sessionId: string): Promise<Exchange[]> {
    const session = await sessionApi.assert(sessionId);
    const snapshot = await catalogApi.snapshot(sessionId);
    return scopeRowsOf(snapshot, session.userId);
  },

  async create(sessionId: string, draft: ExchangeDraft): Promise<Exchange> {
    const session = await sessionApi.assert(sessionId);
    if (
      draft.from_user_id !== session.userId ||
      draft.to_user_id === session.userId
    ) {
      throw new PermissionDeniedError();
    }
    const snapshot = await catalogApi.snapshot(sessionId);
    const targetItem = snapshot.items.find((item) => item.id === draft.to_item_id);
    if (!targetItem || targetItem.user_id !== draft.to_user_id) {
      throw new PermissionDeniedError();
    }
    if (targetItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('目标物品当前不可交换');
    }
    const ownItem = snapshot.items.find((item) => item.id === draft.from_item_id);
    if (!ownItem || ownItem.user_id !== session.userId) {
      throw new PermissionDeniedError();
    }
    if (ownItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('我的物品当前不可交换');
    }

    const nextExchange: Exchange = {
      ...draft,
      status: draft.status ?? ExchangeStatus.PENDING,
      id: storage.createId('exchange'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // 双方各存一份，任何一方登录都只能在自己作用域内看到。
    await upsertExchange(nextExchange.from_user_id, nextExchange);
    await upsertExchange(nextExchange.to_user_id, nextExchange);
    catalogApi.invalidate();
    await operationApi.record(
      sessionId,
      OperationType.EXCHANGE_CREATE,
      `用「${ownItem.title}」发起交换「${targetItem.title}」`,
    );
    return nextExchange;
  },

  async transition(sessionId: string, id: string, status: ExchangeStatus): Promise<Exchange> {
    const session = await sessionApi.assert(sessionId);
    const snapshot = await catalogApi.snapshot(sessionId);
    const current = snapshot.exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');

    const isReceiver = current.to_user_id === session.userId;
    const isInitiator = current.from_user_id === session.userId;
    // 同意/拒绝仅物主（收到方），完成仅发起方；越权操作直接拒绝。
    const allowed =
      isReceiver && [ExchangeStatus.ACCEPTED, ExchangeStatus.REJECTED].includes(status)
        ? true
        : isInitiator && status === ExchangeStatus.COMPLETED
          ? true
          : false;
    if (!allowed) throw new PermissionDeniedError();

    if (!EXCHANGE_ACTION_FLOW[current.status].includes(status)) {
      throw new Error('当前状态不允许该操作');
    }

    const nextExchange: Exchange = {
      ...current,
      status,
      updated_at: new Date().toISOString(),
    };
    await upsertExchange(nextExchange.from_user_id, nextExchange);
    await upsertExchange(nextExchange.to_user_id, nextExchange);

    if (status === ExchangeStatus.COMPLETED) {
      // 联动两件物品状态（跨作用域），完成后目录一并失效。
      await itemApi.applyExchanged(
        sessionId,
        [current.from_item_id, current.to_item_id],
        snapshot,
      );
    }
    catalogApi.invalidate();

    const actionMap: Partial<Record<ExchangeStatus, OperationType>> = {
      [ExchangeStatus.ACCEPTED]: OperationType.EXCHANGE_ACCEPT,
      [ExchangeStatus.REJECTED]: OperationType.EXCHANGE_REJECT,
      [ExchangeStatus.COMPLETED]: OperationType.EXCHANGE_COMPLETE,
    };
    const actionType = actionMap[status];
    if (actionType) {
      await operationApi.record(sessionId, actionType, `交换请求 ${nextExchange.id} 状态更新`);
    }
    return nextExchange;
  },
};

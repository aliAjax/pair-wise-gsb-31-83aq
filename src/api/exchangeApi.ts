import { orderBy } from 'lodash-es';

import { EXCHANGE_ACTION_FLOW, ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import { PermissionError } from '@/utils/errors';
import { scopeKey, storage } from '@/utils/storage';
import { session } from '@/utils/session';

import { itemApi } from './itemApi';
import { operationLogApi } from './operationLogApi';

type SessionClaim = { userId: string; nonce: string };

// 同一 id 取 revision 更大的结果：双方作用域、多标签页合并都不会用旧结果覆盖新结果。
export const mergeExchanges = (lists: Exchange[][]): Exchange[] => {
  const byId = new Map<string, Exchange>();
  lists.flat().forEach((exchange) => {
    const existing = byId.get(exchange.id);
    if (!existing || exchange.revision > existing.revision) byId.set(exchange.id, exchange);
  });
  return orderBy([...byId.values()], ['updated_at'], ['desc']);
};

const mergeIntoScope = async (userId: string, next: Exchange): Promise<void> => {
  await storage.update<Exchange[]>(
    scopeKey('exchanges', userId),
    (previous) => mergeExchanges([previous, [next]]),
    [],
  );
};

const writeBothScopes = async (exchange: Exchange): Promise<void> => {
  await Promise.all([
    mergeIntoScope(exchange.from_user_id, exchange),
    mergeIntoScope(exchange.to_user_id, exchange),
  ]);
};

const ACTION_LABEL: Partial<Record<ExchangeStatus, string>> = {
  [ExchangeStatus.ACCEPTED]: '同意交换',
  [ExchangeStatus.REJECTED]: '拒绝交换',
  [ExchangeStatus.COMPLETED]: '完成交换',
};

const COUNTERPART_LABEL: Partial<Record<ExchangeStatus, string>> = {
  [ExchangeStatus.ACCEPTED]: '交换请求被同意',
  [ExchangeStatus.REJECTED]: '交换请求被拒绝',
  [ExchangeStatus.COMPLETED]: '交换已被确认完成',
};

export const exchangeApi = {
  /** 聚合所有用户作用域的交换请求：交换列表、首页统计读取同一结果。 */
  async listVisible(): Promise<Exchange[]> {
    const userIds = await storage.scopeUserIds('exchanges');
    const lists = await Promise.all(userIds.map((userId) => this.listByUser(userId)));
    return mergeExchanges(lists);
  },

  /** 当前用户相关的请求：我发起的 + 我收到的，均来自该用户作用域。 */
  async listByUser(userId: string): Promise<Exchange[]> {
    return storage.get<Exchange[]>(scopeKey('exchanges', userId), []);
  },

  /** 迁移 / 初始化专用：整体写入某用户作用域。 */
  async writeScope(userId: string, exchanges: Exchange[]): Promise<void> {
    await storage.set(scopeKey('exchanges', userId), exchanges);
  },

  async detail(id: string): Promise<Exchange | undefined> {
    const exchanges = await this.listVisible();
    return exchanges.find((item) => item.id === id);
  },

  /** 发起交换：校验最新会话，只能以当前账号为发起人。 */
  async create(claim: SessionClaim, draft: ExchangeDraft): Promise<Exchange> {
    await session.assert(claim);
    if (draft.from_user_id !== claim.userId) {
      throw new PermissionError('只能以当前登录账号发起交换');
    }
    if (draft.from_user_id === draft.to_user_id) {
      throw new Error('不能与自己发起交换');
    }
    const items = await itemApi.listVisible();
    const targetItem = items.find((item) => item.id === draft.to_item_id);
    const ownItem = items.find((item) => item.id === draft.from_item_id);
    if (!targetItem || targetItem.user_id !== draft.to_user_id) {
      throw new Error('目标物品不存在或不属于对方');
    }
    if (!ownItem || ownItem.user_id !== claim.userId) {
      throw new PermissionError('只能使用自己发布的物品发起交换');
    }
    if (targetItem.status !== ItemStatus.AVAILABLE || ownItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('参与交换的物品当前不可交换');
    }
    const timestamp = new Date().toISOString();
    const nextExchange: Exchange = {
      ...draft,
      id: storage.createId('exchange'),
      status: draft.status ?? ExchangeStatus.PENDING,
      created_at: timestamp,
      updated_at: timestamp,
      revision: 1,
    };
    await writeBothScopes(nextExchange);
    const detailText = `用《${ownItem.title}》换《${targetItem.title}》`;
    await operationLogApi.append(claim, {
      scopeUserId: claim.userId,
      action: '发起交换',
      detail: detailText,
      target_id: nextExchange.id,
    });
    await operationLogApi.append(claim, {
      scopeUserId: draft.to_user_id,
      action: '收到交换请求',
      detail: detailText,
      target_id: nextExchange.id,
    });
    return nextExchange;
  },

  /**
   * 状态流转：
   * - 读写前校验最新会话，拒绝旧标签页写回；
   * - 同意/拒绝仅物品主人（to_user），完成允许双方；
   * - 状态机非法流转直接拒绝；
   * - 结果按 revision 合并进双方作用域，不会覆盖更新的结果。
   */
  async transition(
    claim: SessionClaim,
    id: string,
    status: ExchangeStatus,
    /** 页面上发起操作时看到的版本号，用于拒绝基于旧结果的提交。 */
    expectedRevision?: number,
  ): Promise<Exchange> {
    const current = await this.detail(id);
    if (!current) throw new Error('交换请求不存在');
    await session.assert(claim, {
      participantIds: [current.from_user_id, current.to_user_id],
    });
    if (
      (status === ExchangeStatus.ACCEPTED || status === ExchangeStatus.REJECTED) &&
      claim.userId !== current.to_user_id
    ) {
      throw new PermissionError('只有物品主人可以同意或拒绝该请求');
    }
    if (expectedRevision !== undefined && current.revision > expectedRevision) {
      throw new Error('交换请求状态已更新，请刷新后查看最新结果');
    }
    if (!EXCHANGE_ACTION_FLOW[current.status].includes(status)) {
      throw new Error('当前状态不允许该操作');
    }
    const nextExchange: Exchange = {
      ...current,
      status,
      updated_at: new Date().toISOString(),
      revision: current.revision + 1,
    };
    await writeBothScopes(nextExchange);
    if (status === ExchangeStatus.COMPLETED) {
      await itemApi.markExchangedInternal([current.from_item_id, current.to_item_id]);
    }
    const counterpartId =
      claim.userId === current.from_user_id ? current.to_user_id : current.from_user_id;
    const label = ACTION_LABEL[status];
    const counterpartLabel = COUNTERPART_LABEL[status];
    if (label && counterpartLabel) {
      await operationLogApi.append(claim, {
        scopeUserId: claim.userId,
        action: label,
        detail: `交换请求 ${id}`,
        target_id: id,
      });
      await operationLogApi.append(claim, {
        scopeUserId: counterpartId,
        action: counterpartLabel,
        detail: `交换请求 ${id}`,
        target_id: id,
      });
    }
    return nextExchange;
  },
};

import { ItemStatus } from '@/constants/item';
import { OperationType } from '@/models/operationLog';
import type { Item, ItemDraft } from '@/models/item';
import type { CatalogSnapshot } from '@/types';

import { catalogApi } from './catalogApi';
import { operationApi } from './operationApi';
import { sessionApi } from './sessionApi';
import { PermissionDeniedError } from '@/utils/errors';
import { storage } from '@/utils/storage';

// 同作用域 CAS 冲突时按最新 revision 重试有限次。
const retryScoped = async <T>(
  kind: 'items',
  userId: string,
  apply: (rows: T[]) => T[],
  retries = 3,
): Promise<void> => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const collection = await storage.getScoped<T>(kind, userId);
    try {
      await storage.compareSetScoped<T>(kind, userId, collection.revision, apply);
      return;
    } catch (error) {
      if (attempt === retries) throw error;
    }
  }
};

export const itemApi = {
  // 我发布的物品：只读本账号作用域。
  async listMine(sessionId: string): Promise<Item[]> {
    const session = await sessionApi.assert(sessionId);
    const collection = await storage.getScoped<Item>('items', session.userId);
    return collection.rows;
  },

  // 浏览详情：会话校验后从统一目录取，首页与详情看到的数据口径一致。
  async detail(sessionId: string, id: string): Promise<Item | undefined> {
    const snapshot = await catalogApi.snapshot(sessionId);
    return snapshot.items.find((item) => item.id === id);
  },

  async create(sessionId: string, draft: ItemDraft): Promise<Item> {
    const session = await sessionApi.assertOwner(sessionId, draft.user_id);
    const collection = await storage.getScoped<Item>('items', session.userId);
    const nextItem: Item = {
      ...draft,
      id: storage.createId('item'),
      status: draft.status ?? ItemStatus.AVAILABLE,
      created_at: new Date().toISOString(),
    };
    await storage.compareSetScoped<Item>('items', session.userId, collection.revision, (rows) => [
      nextItem,
      ...rows,
    ]);
    catalogApi.invalidate();
    await operationApi.record(sessionId, OperationType.ITEM_PUBLISH, `发布物品「${nextItem.title}」`);
    return nextItem;
  },

  async update(sessionId: string, id: string, patch: Partial<Item>): Promise<Item> {
    const session = await sessionApi.assert(sessionId);
    const collection = await storage.getScoped<Item>('items', session.userId);
    const current = collection.rows.find((item) => item.id === id);
    // 越权请求直接拒绝：不在本人作用域内的物品不允许改。
    if (!current) throw new PermissionDeniedError();
    const nextItem: Item = { ...current, ...patch, id: current.id, user_id: current.user_id };
    await storage.compareSetScoped<Item>('items', session.userId, collection.revision, (rows) =>
      rows.map((item) => (item.id === id ? nextItem : item)),
    );
    catalogApi.invalidate();
    return nextItem;
  },

  async setStatus(sessionId: string, id: string, status: ItemStatus): Promise<Item> {
    const item = await this.update(sessionId, id, { status });
    await operationApi.record(sessionId, OperationType.ITEM_OFFLINE, `下架物品「${item.title}」`);
    return item;
  },

  // 交换完成时联动两件物品：可能横跨本人与对方两个作用域，
  // 仅允许 exchangeApi 在完成动作（已做归属校验）后内部调用。
  async applyExchanged(
    sessionId: string,
    itemIds: string[],
    snapshot: CatalogSnapshot,
  ): Promise<void> {
    await sessionApi.assert(sessionId);
    for (const itemId of itemIds) {
      const owner = snapshot.items.find((item) => item.id === itemId);
      if (!owner || owner.status === ItemStatus.EXCHANGED) continue;
      await retryScoped<Item>('items', owner.user_id, (rows) =>
        rows.map((item) =>
          item.id === itemId ? { ...item, status: ItemStatus.EXCHANGED } : item,
        ),
      );
    }
    catalogApi.invalidate();
  },
};

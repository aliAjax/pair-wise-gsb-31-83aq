import { orderBy } from 'lodash-es';

import { ItemStatus } from '@/constants/item';
import type { Item, ItemDraft } from '@/models/item';
import { scopeKey, storage } from '@/utils/storage';
import { session } from '@/utils/session';

import { operationLogApi } from './operationLogApi';

type SessionClaim = { userId: string; nonce: string };

// 同一 id 取 revision 更大的结果，保证各标签页读到的聚合列表一致。
export const mergeItems = (lists: Item[][]): Item[] => {
  const byId = new Map<string, Item>();
  lists.flat().forEach((item) => {
    const existing = byId.get(item.id);
    if (!existing || item.revision > existing.revision) byId.set(item.id, item);
  });
  return orderBy([...byId.values()], ['created_at'], ['desc']);
};

const mutateOwnedItem = async (
  ownerId: string,
  itemId: string,
  mutate: (current: Item) => Item,
): Promise<Item> =>
  storage.update<Item[]>(
    scopeKey('items', ownerId),
    (items) => {
      const current = items.find((item) => item.id === itemId);
      if (!current) throw new Error('物品不存在');
      const next = mutate(current);
      return items.map((item) => (item.id === itemId ? next : item));
    },
    [],
  ).then((items) => items.find((item) => item.id === itemId) as Item);

export const itemApi = {
  /** 聚合所有用户作用域的物品：首页、交换列表读取同一结果。 */
  async listVisible(): Promise<Item[]> {
    const ownerIds = await storage.scopeUserIds('items');
    const lists = await Promise.all(ownerIds.map((userId) => this.listByOwner(userId)));
    return mergeItems(lists);
  },

  async listByOwner(userId: string): Promise<Item[]> {
    return storage.get<Item[]>(scopeKey('items', userId), []);
  },

  /** 迁移 / 初始化专用：整体写入某用户作用域。 */
  async writeScope(userId: string, items: Item[]): Promise<void> {
    await storage.set(scopeKey('items', userId), items);
  },

  async detail(id: string): Promise<Item | undefined> {
    const items = await this.listVisible();
    return items.find((item) => item.id === id);
  },

  /** 发布物品：校验最新会话，且只能发布到自己的作用域。 */
  async create(claim: SessionClaim, draft: ItemDraft): Promise<Item> {
    await session.assert(claim, { ownerId: draft.user_id });
    const nextItem: Item = {
      ...draft,
      id: storage.createId('item'),
      status: draft.status ?? ItemStatus.AVAILABLE,
      created_at: new Date().toISOString(),
      revision: 1,
    };
    await storage.update<Item[]>(
      scopeKey('items', claim.userId),
      (items) => [nextItem, ...items],
      [],
    );
    await operationLogApi.append(claim, {
      scopeUserId: claim.userId,
      action: '发布物品',
      detail: nextItem.title,
      target_id: nextItem.id,
    });
    return nextItem;
  },

  /** 编辑物品：读写前校验会话与归属，越权请求直接拒绝；revision 过期的提交直接拒绝。 */
  async update(
    claim: SessionClaim,
    id: string,
    patch: Partial<Item>,
    expectedRevision?: number,
    logAction = '编辑物品',
  ): Promise<Item> {
    const current = await this.detail(id);
    if (!current) throw new Error('物品不存在');
    await session.assert(claim, { ownerId: current.user_id });
    if (expectedRevision !== undefined && current.revision > expectedRevision) {
      throw new Error('物品已被更新，请刷新后查看最新结果');
    }
    const nextItem = await mutateOwnedItem(current.user_id, id, (item) => ({
      ...item,
      ...patch,
      revision: item.revision + 1,
    }));
    await operationLogApi.append(claim, {
      scopeUserId: claim.userId,
      action: logAction,
      detail: nextItem.title,
      target_id: nextItem.id,
    });
    return nextItem;
  },

  async setStatus(
    claim: SessionClaim,
    id: string,
    status: ItemStatus,
    expectedRevision?: number,
  ): Promise<Item> {
    const actionText = status === ItemStatus.OFFLINE ? '下架物品' : '更新物品状态';
    return this.update(claim, id, { status }, expectedRevision, actionText);
  },

  /**
   * 交换完成时联动双方物品状态：
   * 由 exchangeApi 在会话/参与方校验后内部调用，按最新数据提升 revision，
   * 不做归属校验，避免把对方物品误判为越权。
   */
  async markExchangedInternal(itemIds: string[]): Promise<void> {
    const items = await this.listVisible();
    const ownersByItem = new Map<string, string>();
    items.forEach((item) => ownersByItem.set(item.id, item.user_id));
    await Promise.all(
      itemIds.map(async (itemId) => {
        const ownerId = ownersByItem.get(itemId);
        if (!ownerId) return;
        await mutateOwnedItem(ownerId, itemId, (item) =>
          item.status === ItemStatus.EXCHANGED
            ? item
            : { ...item, status: ItemStatus.EXCHANGED, revision: item.revision + 1 },
        );
      }),
    );
  },
};

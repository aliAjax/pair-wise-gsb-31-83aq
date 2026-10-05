import { seedExchanges, seedItems, seedUsers } from '@/constants/seed';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { MigrationState } from '@/types';

import { catalogApi } from './catalogApi';
import { sessionApi } from './sessionApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';
import { MigrationError } from '@/utils/errors';

const pendingState = (attempts: number): MigrationState => ({
  status: 'pending',
  attempts,
});

const readState = async (): Promise<MigrationState> => {
  const state = await storage.get<MigrationState | null>(STORAGE_KEYS.migration, null);
  return state ?? { status: 'pending', attempts: 0 };
};

const groupByOwner = <T extends { id: string; user_id?: string; from_user_id?: string; to_user_id?: string }>(
  rows: T[],
  ownerOf: (row: T) => string | null,
) => {
  const buckets = new Map<string, T[]>();
  rows.forEach((row) => {
    const ownerId = ownerOf(row);
    if (!ownerId) return;
    const bucket = buckets.get(ownerId) ?? [];
    bucket.push(row);
    buckets.set(ownerId, bucket);
  });
  return buckets;
};

const exchangeOwnerIds = (exchange: Exchange): string[] =>
  [exchange.from_user_id, exchange.to_user_id].filter(Boolean);

// 合并入作用域：按 id 去重、updated_at 较新者优先，保证重试幂等且不回写旧结果。
const mergeItems = (existing: Item[], incoming: Item[]) => {
  const map = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const prev = map.get(item.id);
    if (!prev || item.created_at >= prev.created_at) map.set(item.id, item);
  });
  return [...map.values()];
};

const mergeExchanges = (existing: Exchange[], incoming: Exchange[]) => {
  const map = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const prev = map.get(item.id);
    if (!prev || item.updated_at >= prev.updated_at) map.set(item.id, item);
  });
  return [...map.values()];
};

const putMergedItems = async (userId: string, incoming: Item[]) => {
  const current = await storage.getScoped<Item>('items', userId);
  await storage.putScoped('items', userId, mergeItems(current.rows, incoming));
};

const putMergedExchanges = async (userId: string, incoming: Exchange[]) => {
  const current = await storage.getScoped<Exchange>('exchanges', userId);
  await storage.putScoped('exchanges', userId, mergeExchanges(current.rows, incoming));
};

export const migrationApi = {
  async getState(): Promise<MigrationState> {
    return readState();
  },

  // 迁移旧的全局物品 / 交换请求到各用户作用域。失败只记录状态，可反复重试。
  async run(): Promise<MigrationState> {
    const previous = await readState();
    if (previous.status === 'done') return previous;

    const attempts = previous.attempts + 1;
    await storage.set(STORAGE_KEYS.migration, pendingState(attempts));
    try {
      const legacyItems = await storage.get<Item[]>(STORAGE_KEYS.legacyItems, []);
      const legacyExchanges = await storage.get<Exchange[]>(STORAGE_KEYS.legacyExchanges, []);
      const legacyCurrentUserId = await storage.get<string | null>(
        STORAGE_KEYS.legacyCurrentUserId,
        null,
      );

      const hasLegacy = legacyItems.length > 0 || legacyExchanges.length > 0;
      if (hasLegacy) {
        const itemBuckets = groupByOwner(legacyItems, (item) => item.user_id ?? null);
        for (const [userId, rows] of itemBuckets) {
          await putMergedItems(userId, rows);
        }
        const exchangeBuckets = new Map<string, Exchange[]>();
        legacyExchanges.forEach((exchange) => {
          exchangeOwnerIds(exchange).forEach((userId) => {
            const bucket = exchangeBuckets.get(userId) ?? [];
            bucket.push(exchange);
            exchangeBuckets.set(userId, bucket);
          });
        });
        for (const [userId, rows] of exchangeBuckets) {
          await putMergedExchanges(userId, rows);
        }
      } else {
        // 全新安装：把演示数据种入各自作用域，仅在作用域缺该 id 时补齐。
        const seedItemBuckets = groupByOwner(seedItems, (item) => item.user_id ?? null);
        for (const [userId, rows] of seedItemBuckets) {
          await putMergedItems(userId, rows);
        }
        const seedExchangeBuckets = new Map<string, Exchange[]>();
        seedExchanges.forEach((exchange) => {
          exchangeOwnerIds(exchange).forEach((userId) => {
            const bucket = seedExchangeBuckets.get(userId) ?? [];
            bucket.push(exchange);
            seedExchangeBuckets.set(userId, bucket);
          });
        });
        for (const [userId, rows] of seedExchangeBuckets) {
          await putMergedExchanges(userId, rows);
        }
      }

      // 迁移成功后清理旧的全局 key（包含 IndexedDB），避免再次混入。
      await storage.remove(STORAGE_KEYS.legacyItems);
      await storage.remove(STORAGE_KEYS.legacyExchanges);

      // 首次启动若还没有会话，沿用旧 current-user-id 建立一个全新会话。
      const existingSession = await sessionApi.current();
      if (!existingSession) {
        const initialUserId = legacyCurrentUserId ?? seedUsers[0].id;
        await storage.remove(STORAGE_KEYS.legacyCurrentUserId);
        await sessionApi.start(initialUserId);
      }

      const state: MigrationState = {
        status: 'done',
        attempts,
        finishedAt: new Date().toISOString(),
      };
      await storage.set(STORAGE_KEYS.migration, state);
      catalogApi.invalidate();
      return state;
    } catch (error) {
      const state: MigrationState = {
        status: 'failed',
        attempts,
        error: error instanceof Error ? error.message : String(error),
      };
      await storage.set(STORAGE_KEYS.migration, state);
      throw new MigrationError(state.error);
    }
  },
};

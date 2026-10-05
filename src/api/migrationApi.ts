import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { MigrationState } from '@/types';
import { storage, STORAGE_KEYS } from '@/utils/storage';
import { session } from '@/utils/session';

import { exchangeApi, mergeExchanges } from './exchangeApi';
import { itemApi, mergeItems } from './itemApi';
import { seedExchanges, seedItems } from './seedData';
import { userApi } from './userApi';

/**
 * v1 → v2 迁移：
 * 物品按归属写入 owner 作用域；交换请求在双方作用域各写一份；操作记录从空开始累积。
 * 全过程可重试、可重入：失败时不写完成标记，再次执行会与现有作用域按 revision 合并。
 */
const normalizeLegacyItems = (items: Item[]): Item[] =>
  items.map((item) => ({ ...item, revision: typeof item.revision === 'number' ? item.revision : 1 }));

const normalizeLegacyExchanges = (exchanges: Exchange[]): Exchange[] =>
  exchanges.map((exchange) => ({
    ...exchange,
    revision: typeof exchange.revision === 'number' ? exchange.revision : 1,
  }));

const groupByOwner = (items: Item[]): Map<string, Item[]> => {
  const grouped = new Map<string, Item[]>();
  items.forEach((item) => {
    const list = grouped.get(item.user_id) ?? [];
    list.push(item);
    grouped.set(item.user_id, list);
  });
  return grouped;
};

const persistItemsForOwners = async (grouped: Map<string, Item[]>) => {
  await Promise.all(
    [...grouped.entries()].map(async ([ownerId, incoming]) => {
      const existing = await itemApi.listByOwner(ownerId);
      await itemApi.writeScope(ownerId, mergeItems([existing, incoming]));
    }),
  );
};

const persistExchangesForUsers = async (exchanges: Exchange[]) => {
  const grouped = new Map<string, Exchange[]>();
  exchanges.forEach((exchange) => {
    [exchange.from_user_id, exchange.to_user_id].forEach((userId) => {
      const list = grouped.get(userId) ?? [];
      list.push(exchange);
      grouped.set(userId, list);
    });
  });
  await Promise.all(
    [...grouped.entries()].map(async ([userId, incoming]) => {
      const existing = await exchangeApi.listByUser(userId);
      await exchangeApi.writeScope(userId, mergeExchanges([existing, incoming]));
    }),
  );
};

/** 全新安装：写入演示数据，保证首页与交换列表开箱即用。 */
const seedFreshScopes = async () => {
  await persistItemsForOwners(groupByOwner(seedItems));
  await persistExchangesForUsers(seedExchanges);
};

// 并发调用（main.ts 与界面重试 / 开发期重复挂载）共享同一次迁移，避免重复播种。
let inflight: Promise<MigrationState> | null = null;

const executeMigration = async (): Promise<MigrationState> => {
  const state = await migrationApi.getState();
  if (state.status === 'done') return state;

  try {
    const users = await userApi.list();
    const knownUserIds = new Set(users.map((user) => user.id));

    // 1. 迁移旧物品到各归属用户作用域。
    const legacyItems = normalizeLegacyItems(
      await storage.getAnyVersion<Item[]>(STORAGE_KEYS.legacyItems, []),
    );
    if (legacyItems.length) {
      const grouped = groupByOwner(legacyItems);
      grouped.forEach((_, ownerId) => knownUserIds.add(ownerId));
      await persistItemsForOwners(grouped);
    }

    // 2. 迁移旧交换请求：双方作用域各存一份。
    const legacyExchanges = normalizeLegacyExchanges(
      await storage.getAnyVersion<Exchange[]>(STORAGE_KEYS.legacyExchanges, []),
    );
    if (legacyExchanges.length) {
      legacyExchanges.forEach((exchange) => {
        knownUserIds.add(exchange.from_user_id);
        knownUserIds.add(exchange.to_user_id);
      });
      await persistExchangesForUsers(legacyExchanges);
    }

    // 3. 没有任何作用域数据（全新安装）时写入演示数据。
    const itemOwnerIds = await storage.scopeUserIds('items');
    if (!itemOwnerIds.length) {
      await seedFreshScopes();
    }

    // 4. 会话迁移：旧 current-user-id 升级为带 nonce 的新会话；不存在则默认登录演示账号。
    const currentSession = await session.read();
    if (!currentSession) {
      const legacyUserId = await storage.getAnyVersion<string>(
        STORAGE_KEYS.legacyCurrentUserId,
        '',
      );
      const targetUserId =
        legacyUserId && knownUserIds.has(legacyUserId) ? legacyUserId : users[0]?.id;
      if (targetUserId) await session.login(targetUserId);
    }

    const next: MigrationState = { status: 'done', attemptedAt: new Date().toISOString() };
    await storage.set(STORAGE_KEYS.migrationV2, next);
    return next;
  } catch (error) {
    // 失败保留旧数据与作用域中间结果，不写完成标记，允许后续重试。
    const failed: MigrationState = {
      status: 'failed',
      attemptedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : '迁移失败',
    };
    await storage.set(STORAGE_KEYS.migrationV2, failed);
    return failed;
  }
};

export const migrationApi = {
  async getState(): Promise<MigrationState> {
    return storage.get<MigrationState>(STORAGE_KEYS.migrationV2, {
      status: 'pending',
      attemptedAt: '',
    });
  },

  /** 迁移完成后首页/交换列表读取同一聚合结果。 */
  async isDone(): Promise<boolean> {
    return (await this.getState()).status === 'done';
  },

  async run(): Promise<MigrationState> {
    if (inflight) return inflight;
    inflight = executeMigration().finally(() => {
      inflight = null;
    });
    return inflight;
  },

  /** 迁移失败后的可重试入口（与 run 相同，重入且按 revision 合并）。 */
  async retry(): Promise<MigrationState> {
    return this.run();
  },
};


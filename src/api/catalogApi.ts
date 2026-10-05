import type { CatalogSnapshot } from '@/types';

import { userApi } from './userApi';
import { sessionApi } from './sessionApi';
import { storage } from '@/utils/storage';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';

// 首页与交换列表必须读取同一结果：所有读取共用同一个快照 Promise，写操作后主动失效。
let inflight: Promise<CatalogSnapshot> | null = null;
let cached: CatalogSnapshot | null = null;

const buildSnapshot = async (): Promise<CatalogSnapshot> => {
  const users = await userApi.list();
  const entries = await Promise.all(
    users.map(async (user) => ({
      userId: user.id,
      items: await storage.getScoped<Item>('items', user.id),
      exchanges: await storage.getScoped<Exchange>('exchanges', user.id),
    })),
  );
  const itemMap = new Map<string, Item>();
  const exchangeMap = new Map<string, Exchange>();
  entries.forEach((entry) => {
    entry.items.rows.forEach((item) => {
      if (!itemMap.has(item.id)) itemMap.set(item.id, item);
    });
    entry.exchanges.rows.forEach((exchange) => {
      if (!exchangeMap.has(exchange.id)) exchangeMap.set(exchange.id, exchange);
    });
  });
  return {
    items: [...itemMap.values()],
    exchanges: [...exchangeMap.values()],
    ownerIds: users.map((user) => user.id),
    generatedAt: new Date().toISOString(),
  };
};

export const catalogApi = {
  // 读取前同样校验会话：会话过期或被新标签页顶替时拒绝读取旧视角的数据。
  async snapshot(sessionId: string | null | undefined, force = false): Promise<CatalogSnapshot> {
    await sessionApi.assert(sessionId);
    if (!force && cached) return cached;
    if (!force && inflight) return inflight;
    inflight = buildSnapshot()
      .then((snapshot) => {
        cached = snapshot;
        return snapshot;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },

  invalidate(): void {
    cached = null;
    inflight = null;
  },
};

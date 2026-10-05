import { del, get, keys, set } from 'idb-keyval';

import { ConflictError } from '@/utils/errors';
import type { PersistedEnvelope, ScopeKind, ScopedCollection, SessionInfo } from '@/types';

const STORAGE_VERSION = 1;
const DEFAULT_TTL = 1000 * 60 * 60 * 24 * 365;

const prefixed = (key: string) => `reswap:${key}`;

export const STORAGE_KEYS = {
  currentSession: prefixed('current-session'),
  users: prefixed('users'),
  theme: prefixed('theme'),
  lastClean: prefixed('last-clean'),
  migration: prefixed('migration-v2'),
  legacyItems: prefixed('items'),
  legacyExchanges: prefixed('exchanges'),
  legacyCurrentUserId: prefixed('current-user-id'),
};

export const scopeKey = (kind: ScopeKind, userId: string) => prefixed(`scope:${kind}:${userId}`);

const now = () => Date.now();

const envelope = <T>(payload: T, ttl = DEFAULT_TTL): PersistedEnvelope<T> => ({
  version: STORAGE_VERSION,
  expiresAt: now() + ttl,
  payload,
});

const toPlain = <T>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T;

const isExpired = <T>(data: PersistedEnvelope<T> | null | undefined) => {
  if (!data) return false;
  return Boolean(data.expiresAt && data.expiresAt < now());
};

const parseLocal = <T>(key: string): PersistedEnvelope<T> | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedEnvelope<T>;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

const writeLocal = <T>(key: string, payload: T, ttl?: number) => {
  localStorage.setItem(key, JSON.stringify(envelope(payload, ttl)));
};

// 键级异步互斥：同一 key 的读改写串行，避免两个标签页/两个动作交叉覆盖。
const keyChains = new Map<string, Promise<unknown>>();

const withKeyLock = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = keyChains.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  keyChains.set(key, queued);
  try {
    await previous.catch(() => undefined);
    return await task();
  } finally {
    release();
    if (keyChains.get(key) === queued) {
      keyChains.delete(key);
    }
  }
};

export const storage = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const localEnvelope = parseLocal<T>(key);
    if (isExpired(localEnvelope)) {
      await this.remove(key);
      return fallback;
    }
    if (localEnvelope?.version === STORAGE_VERSION) {
      return localEnvelope.payload;
    }

    const indexedEnvelope = await get<PersistedEnvelope<T>>(key);
    if (isExpired(indexedEnvelope)) {
      await this.remove(key);
      return fallback;
    }
    if (indexedEnvelope?.version === STORAGE_VERSION) {
      writeLocal(key, indexedEnvelope.payload);
      return indexedEnvelope.payload;
    }
    return fallback;
  },

  async set<T>(key: string, payload: T, ttl?: number): Promise<T> {
    const plainPayload = toPlain(payload);
    const packed = envelope(plainPayload, ttl);
    localStorage.setItem(key, JSON.stringify(packed));
    await set(key, packed);
    return plainPayload;
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    await del(key);
  },

  // 读取某用户作用域集合（私人物品 / 交换请求 / 操作记录）。
  async readScopedRaw<T>(kind: ScopeKind, userId: string): Promise<ScopedCollection<T>> {
    const key = scopeKey(kind, userId);
    const collection = await this.get<ScopedCollection<T> | null>(key, null);
    if (collection && Array.isArray(collection.rows)) {
      return { revision: collection.revision ?? 0, rows: collection.rows };
    }
    return { revision: 0, rows: [] };
  },

  async getScoped<T>(kind: ScopeKind, userId: string): Promise<ScopedCollection<T>> {
    const key = scopeKey(kind, userId);
    return withKeyLock(key, () => this.readScopedRaw<T>(kind, userId));
  },

  // 整作用域写入（迁移用），返回新 revision。
  async putScoped<T>(kind: ScopeKind, userId: string, rows: T[]): Promise<number> {
    const key = scopeKey(kind, userId);
    return withKeyLock(key, async () => {
      const collection: ScopedCollection<T> = { revision: 1, rows: toPlain(rows) };
      await this.set(key, collection);
      return collection.revision;
    });
  },

  // 按最新 revision 提交：expectedRevision 与存储不一致时拒绝，绝不覆盖更新结果。
  async compareSetScoped<T>(
    kind: ScopeKind,
    userId: string,
    expectedRevision: number,
    mutate: (rows: T[]) => T[],
  ): Promise<ScopedCollection<T>> {
    const key = scopeKey(kind, userId);
    return withKeyLock(key, async () => {
      const current = await this.readScopedRaw<T>(kind, userId);
      if (current.revision !== expectedRevision) {
        throw new ConflictError();
      }
      const next: ScopedCollection<T> = {
        revision: current.revision + 1,
        rows: toPlain(mutate(current.rows)),
      };
      await this.set(key, next);
      return next;
    });
  },

  async getSession(): Promise<SessionInfo | null> {
    const session = await this.get<SessionInfo | null>(STORAGE_KEYS.currentSession, null);
    if (!session || !session.userId || !session.sessionId) return null;
    return session;
  },

  async cleanExpired(): Promise<void> {
    const keysToClean = new Set<string>(Object.values(STORAGE_KEYS));
    try {
      const indexedKeys = (await keys()) as string[];
      indexedKeys
        .filter((key) => typeof key === 'string' && key.startsWith('reswap:'))
        .forEach((key) => keysToClean.add(key));
    } catch {
      // IndexedDB 不可用时仍可清理 localStorage 侧。
    }
    await Promise.all(
      [...keysToClean].map(async (key) => {
        const localEnvelope = parseLocal<unknown>(key);
        if (isExpired(localEnvelope)) {
          await this.remove(key);
        }
      }),
    );
    localStorage.setItem(STORAGE_KEYS.lastClean, JSON.stringify(envelope(new Date().toISOString())));
  },

  createId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  },
};

import { del, get, keys, set } from 'idb-keyval';

import type { PersistedEnvelope, ScopeKind } from '@/types';

const STORAGE_VERSION = 2;
const DEFAULT_TTL = 1000 * 60 * 60 * 24 * 365;

const prefixed = (key: string) => `reswap:${key}`;

export const STORAGE_KEYS = {
  session: prefixed('session'),
  users: prefixed('users'),
  migrationV2: prefixed('migration:v2'),
  theme: prefixed('theme'),
  lastClean: prefixed('last-clean'),
  // v1 全局混写的旧 key，仅迁移流程读取。
  legacyCurrentUserId: prefixed('current-user-id'),
  legacyItems: prefixed('items'),
  legacyExchanges: prefixed('exchanges'),
};

export const scopeKey = (kind: ScopeKind, userId: string) => prefixed(`scope:${userId}:${kind}`);

const scopePrefix = (kind: ScopeKind) => prefixed(`scope:`);
const scopeSuffix = (kind: ScopeKind) => `:${kind}`;

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

const parseLocal = <T>(key: string, acceptLegacy = false): PersistedEnvelope<T> | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedEnvelope<T>;
    if (!acceptLegacy && parsed.version !== STORAGE_VERSION) return null;
    return parsed;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

const writeLocal = <T>(key: string, payload: T, ttl?: number) => {
  localStorage.setItem(key, JSON.stringify(envelope(payload, ttl)));
};

// 同一 key 的“读-改-写”必须串行，避免两个标签页/两个异步动作互相覆盖。
const updateQueues = new Map<string, Promise<unknown>>();

const withKeyLock = <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = updateQueues.get(key) ?? Promise.resolve();
  const current = previous.then(task, task);
  updateQueues.set(
    key,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
};

export const storage = {
  version: STORAGE_VERSION,

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
    if (isExpired(indexedEnvelope ?? null)) {
      await this.remove(key);
      return fallback;
    }
    if (indexedEnvelope?.version === STORAGE_VERSION) {
      writeLocal(key, indexedEnvelope.payload);
      return indexedEnvelope.payload;
    }
    return fallback;
  },

  // 迁移专用：忽略版本号读取旧数据（v1 信封）。
  async getAnyVersion<T>(key: string, fallback: T): Promise<T> {
    const localEnvelope = parseLocal<T>(key, true);
    if (localEnvelope) return localEnvelope.payload;
    const indexedEnvelope = await get<PersistedEnvelope<T>>(key);
    if (indexedEnvelope) return indexedEnvelope.payload;
    return fallback;
  },

  async set<T>(key: string, payload: T, ttl?: number): Promise<T> {
    const plainPayload = toPlain(payload);
    const packed = envelope(plainPayload, ttl);
    localStorage.setItem(key, JSON.stringify(packed));
    await set(key, packed);
    return plainPayload;
  },

  // 以存储中的最新值为准做合并提交，producer 返回的结果整体写回。
  async update<T>(key: string, producer: (previous: T) => T | Promise<T>, fallback: T): Promise<T> {
    return withKeyLock(key, async () => {
      const previous = await this.get<T>(key, fallback);
      const next = await producer(previous);
      await this.set(key, next);
      return next;
    });
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    await del(key);
  },

  // 扫描所有写入过某类用户作用域的 userId（localStorage 与 IndexedDB 并集）。
  async scopeUserIds(kind: ScopeKind): Promise<string[]> {
    const ids = new Set<string>();
    const prefix = scopePrefix(kind);
    const suffix = scopeSuffix(kind);
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        ids.add(key.slice(prefix.length, key.length - suffix.length));
      }
    });
    try {
      const idbKeys = await keys();
      idbKeys.forEach((key) => {
        if (typeof key !== 'string') return;
        if (key.startsWith(prefix) && key.endsWith(suffix)) {
          ids.add(key.slice(prefix.length, key.length - suffix.length));
        }
      });
    } catch {
      // IndexedDB 不可用时仍可依靠 localStorage。
    }
    return [...ids];
  },

  async cleanExpired(): Promise<void> {
    const trackedKeys = [
      STORAGE_KEYS.session,
      STORAGE_KEYS.users,
      STORAGE_KEYS.migrationV2,
      STORAGE_KEYS.theme,
      STORAGE_KEYS.legacyItems,
      STORAGE_KEYS.legacyExchanges,
      STORAGE_KEYS.legacyCurrentUserId,
    ];
    const scopedKinds: ScopeKind[] = ['items', 'exchanges', 'logs'];
    const scopeIds = await Promise.all(scopedKinds.map((kind) => this.scopeUserIds(kind)));
    const allKeys = new Set<string>(trackedKeys);
    scopedKinds.forEach((kind, index) => {
      scopeIds[index].forEach((userId) => allKeys.add(scopeKey(kind, userId)));
    });
    await Promise.all(
      [...allKeys].map(async (key) => {
        const localEnvelope = parseLocal<unknown>(key, true);
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

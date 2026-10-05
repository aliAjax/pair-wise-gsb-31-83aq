import type { ExchangeStatus } from '@/constants/exchange';
import type { ItemCondition, ItemStatus } from '@/constants/item';

export interface Option<T extends string> {
  label: string;
  value: T;
}

export interface PersistedEnvelope<T> {
  version: number;
  expiresAt?: number;
  payload: T;
}

export interface StatusFilter {
  item?: ItemStatus;
  exchange?: ExchangeStatus;
  condition?: ItemCondition;
}

export interface ImageFilePayload {
  id: string;
  name: string;
  dataUrl: string;
}

/** 用户作用域下的数据类型，存储键形如 reswap:scope:{userId}:{kind}。 */
export type ScopeKind = 'items' | 'exchanges' | 'logs';

export interface SessionState {
  userId: string;
  /** 每次登录都会刷新，用于识别过期会话 / 旧标签页。 */
  nonce: string;
  /** 最近一次登录时间，作为会话新旧的判断依据。 */
  loggedInAt: number;
}

export type MigrationStatus = 'pending' | 'done' | 'failed';

export interface MigrationState {
  status: MigrationStatus;
  /** 最近一次迁移尝试时间，失败时用于判断是否应提示重试。 */
  attemptedAt: string;
  /** 迁移失败时记录的错误信息。 */
  error?: string;
}

import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { OperationType } from '@/models/operationLog';
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

export type ScopeKind = 'items' | 'exchanges' | 'operations';

export interface ScopedCollection<T> {
  revision: number;
  rows: T[];
}

export interface SessionInfo {
  userId: string;
  sessionId: string;
  startedAt: string;
}

export type MigrationStatus = 'pending' | 'done' | 'failed';

export interface MigrationState {
  status: MigrationStatus;
  attempts: number;
  finishedAt?: string;
  error?: string;
}

export interface CatalogSnapshot {
  items: Item[];
  exchanges: Exchange[];
  ownerIds: string[];
  generatedAt: string;
}

export type { OperationType };

import type { SessionState } from '@/types';

import { storage, STORAGE_KEYS } from './storage';
import { PermissionError, SessionError } from './errors';

const createNonce = () =>
  crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const isSession = (value: unknown): value is SessionState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionState>;
  return Boolean(
    candidate.userId && typeof candidate.nonce === 'string' && typeof candidate.loggedInAt === 'number',
  );
};

export const session = {
  async read(): Promise<SessionState | null> {
    const value = await storage.get<SessionState | null>(STORAGE_KEYS.session, null);
    return isSession(value) ? value : null;
  },

  /** 切换/重新登录：生成全新 nonce，旧标签页随后提交即会被判为过期会话。 */
  async login(userId: string): Promise<SessionState> {
    const next: SessionState = { userId, nonce: createNonce(), loggedInAt: Date.now() };
    await storage.set(STORAGE_KEYS.session, next);
    return next;
  },

  /**
   * 读写前校验会话：
   * - 必须处于登录态；
   * - 提交方携带的 nonce 必须等于存储中的最新 nonce（否则是旧标签页的写回）；
   * - 可选限定数据归属用户，或限定会话用户必须是参与方之一。
   */
  async assert(
    claim: { userId: string; nonce: string },
    options?: { ownerId?: string; participantIds?: string[] },
  ): Promise<SessionState> {
    const latest = await this.read();
    if (!latest) {
      throw new SessionError('登录状态已失效，请重新登录');
    }
    if (latest.userId !== claim.userId || latest.nonce !== claim.nonce) {
      throw new SessionError('登录账号已切换，请刷新后使用最新账号操作');
    }
    if (options?.ownerId !== undefined && options.ownerId !== latest.userId) {
      throw new PermissionError();
    }
    if (options?.participantIds && !options.participantIds.includes(latest.userId)) {
      throw new PermissionError();
    }
    return latest;
  },

  /** 从 storage 事件（其他标签页写入的最新会话）解析会话。 */
  parseEvent(event: StorageEvent): SessionState | null {
    if (event.key !== STORAGE_KEYS.session || !event.newValue) return null;
    try {
      const envelope = JSON.parse(event.newValue) as { payload?: unknown };
      return isSession(envelope.payload) ? (envelope.payload as SessionState) : null;
    } catch {
      return null;
    }
  },
};

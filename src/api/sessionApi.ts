import type { SessionInfo } from '@/types';

import { storage, STORAGE_KEYS } from '@/utils/storage';
import { PermissionDeniedError, SessionStaleError } from '@/utils/errors';

const createSession = (userId: string): SessionInfo => ({
  userId,
  sessionId: storage.createId('sess'),
  startedAt: new Date().toISOString(),
});

export const sessionApi = {
  async current(): Promise<SessionInfo | null> {
    return storage.getSession();
  },

  // 每次登录（含切换账号）都生成全新 sessionId，旧标签页携带的会话随即过期。
  async start(userId: string): Promise<SessionInfo> {
    const session = createSession(userId);
    await storage.set(STORAGE_KEYS.currentSession, session);
    return session;
  },

  // 读/写前统一校验：调用方必须仍持有存储中的最新会话。
  async assert(sessionId: string | null | undefined): Promise<SessionInfo> {
    if (!sessionId) throw new SessionStaleError();
    const session = await storage.getSession();
    if (!session) throw new SessionStaleError();
    if (session.sessionId !== sessionId) throw new SessionStaleError();
    return session;
  },

  // 写操作归属校验：只能写当前会话账号自己的作用域。
  async assertOwner(sessionId: string, userId: string): Promise<SessionInfo> {
    const session = await this.assert(sessionId);
    if (session.userId !== userId) {
      throw new PermissionDeniedError();
    }
    return session;
  },

  // 监听其他标签页的登录/切换，回调最新会话。
  onChange(listener: (session: SessionInfo | null) => void): () => void {
    const handler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.currentSession || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as { payload?: SessionInfo };
        listener(parsed.payload ?? null);
      } catch {
        listener(null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
};

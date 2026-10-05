import { seedUsers } from '@/constants/seed';
import type { User, UserDraft } from '@/models/user';

import { sessionApi } from './sessionApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';

export const userApi = {
  async list(): Promise<User[]> {
    const users = await storage.get<User[]>(STORAGE_KEYS.users, []);
    if (users.length) return users;
    await storage.set(STORAGE_KEYS.users, seedUsers);
    return seedUsers;
  },

  async resolve(userId: string): Promise<User> {
    const users = await this.list();
    const user = users.find((item) => item.id === userId);
    if (!user) throw new Error('用户不存在');
    return user;
  },

  async current(): Promise<User | null> {
    const session = await sessionApi.current();
    if (!session) return null;
    const users = await this.list();
    return users.find((user) => user.id === session.userId) ?? null;
  },

  // 切换账号：重置为全新会话，旧标签页持有的 sessionId 立刻失效。
  async login(userId: string): Promise<User> {
    const user = await this.resolve(userId);
    await sessionApi.start(user.id);
    return user;
  },

  // 改资料前校验会话，越权（sessionId 已过期或不属于本人）直接抛错拒绝。
  async updateCurrent(sessionId: string, draft: Partial<UserDraft>): Promise<User> {
    const session = await sessionApi.assert(sessionId);
    const users = await this.list();
    const current = users.find((item) => item.id === session.userId);
    if (!current) throw new Error('用户不存在');
    const nextUser: User = { ...current, ...draft, id: current.id };
    await storage.set(
      STORAGE_KEYS.users,
      users.map((item) => (item.id === current.id ? nextUser : item)),
    );
    return nextUser;
  },
};

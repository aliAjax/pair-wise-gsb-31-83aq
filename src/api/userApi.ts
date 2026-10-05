import type { User, UserDraft } from '@/models/user';

import { storage, STORAGE_KEYS } from '@/utils/storage';
import { session } from '@/utils/session';

import { seedUsers } from './seedData';

export const userApi = {
  seedUsers,

  async list(): Promise<User[]> {
    const users = await storage.get<User[]>(STORAGE_KEYS.users, []);
    if (users.length) return users;
    await storage.set(STORAGE_KEYS.users, seedUsers);
    return seedUsers.map((user) => ({ ...user }));
  },

  /** 迁移 / 初始化专用：直接写入用户表。 */
  async writeAll(users: User[]): Promise<void> {
    await storage.set(STORAGE_KEYS.users, users);
  },

  async current(): Promise<User | null> {
    const state = await session.read();
    if (!state) return null;
    const users = await this.list();
    return users.find((user) => user.id === state.userId) ?? null;
  },

  /** 登录：校验用户存在后刷新会话（新 nonce），旧标签页的提交会被拒绝。 */
  async login(userId: string): Promise<User> {
    const users = await this.list();
    const user = users.find((item) => item.id === userId);
    if (!user) throw new Error('用户不存在');
    await session.login(user.id);
    return user;
  },

  /** 修改资料：先按最新会话校验归属，防止旧账号写回他人资料。 */
  async updateCurrent(draft: Partial<UserDraft>): Promise<User> {
    const state = await session.read();
    if (!state) throw new Error('登录状态已失效，请重新登录');
    await session.assert(state);
    const users = await this.list();
    const current = users.find((user) => user.id === state.userId);
    if (!current) throw new Error('用户不存在');
    const nextUser: User = { ...current, ...draft };
    await storage.set(
      STORAGE_KEYS.users,
      users.map((item) => (item.id === current.id ? nextUser : item)),
    );
    return nextUser;
  },
};

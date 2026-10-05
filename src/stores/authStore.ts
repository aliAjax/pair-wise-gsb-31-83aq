import { defineStore } from 'pinia';

import { userApi } from '@/api/userApi';
import type { User, UserDraft } from '@/models/user';
import { AUTH_MESSAGES, PAGE_MESSAGES } from '@/constants/messages';
import { message } from '@/utils/message';
import { session } from '@/utils/session';
import { validateUserDraft } from '@/utils/validators';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    currentUser: null as User | null,
    users: [] as User[],
    loading: false,
    /** 当前页面持有的会话快照（userId + nonce），所有写操作凭它校验最新会话。 */
    sessionState: null as { userId: string; nonce: string } | null,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.currentUser),
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        this.users = await userApi.list();
        const state = await session.read();
        this.sessionState = state ? { userId: state.userId, nonce: state.nonce } : null;
        this.currentUser = state
          ? this.users.find((user) => user.id === state.userId) ?? null
          : null;
      } finally {
        this.loading = false;
      }
    },

    async login(userId: string) {
      await userApi.login(userId);
      await this.hydrate();
      message(`已切换为 ${this.currentUser?.nickname ?? ''}`, 'success');
    },

    /** 其他标签页切换账号后，用最新会话刷新本页状态，避免旧账号继续写数据。 */
    async syncFromExternalSession() {
      await this.hydrate();
    },

    async updateProfile(draft: Partial<UserDraft>) {
      if (!this.sessionState) {
        message(AUTH_MESSAGES.sessionExpired, 'error');
        return;
      }
      const error = validateUserDraft({ ...this.currentUser, ...draft });
      if (error) {
        message(error, 'error');
        return;
      }
      this.currentUser = await userApi.updateCurrent(draft);
      this.users = await userApi.list();
      message(PAGE_MESSAGES.profileUpdated, 'success');
    },
  },
});

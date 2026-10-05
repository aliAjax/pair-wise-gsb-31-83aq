import { defineStore } from 'pinia';

import { operationApi } from '@/api/operationApi';
import { sessionApi } from '@/api/sessionApi';
import { userApi } from '@/api/userApi';
import { OperationType } from '@/models/operationLog';
import type { User, UserDraft } from '@/models/user';
import { SESSION_MESSAGES } from '@/constants/messages';
import { isAppError } from '@/utils/errors';
import { message } from '@/utils/message';
import { validateUserDraft } from '@/utils/validators';

import { useExchangeStore } from './exchangeStore';
import { useItemStore } from './itemStore';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    currentUser: null as User | null,
    users: [] as User[],
    sessionId: '' as string,
    loading: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.currentUser && state.sessionId),
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        this.users = await userApi.list();
        const session = await sessionApi.current();
        const user = session ? this.users.find((item) => item.id === session.userId) ?? null : null;
        this.currentUser = user;
        this.sessionId = session?.sessionId ?? '';
      } finally {
        this.loading = false;
      }
    },

    async login(userId: string) {
      const user = await userApi.login(userId);
      this.currentUser = user;
      const session = await sessionApi.current();
      this.sessionId = session?.sessionId ?? '';
      // 账号一切换，按新作用域重新水合，旧账号的物品/交换请求不再可见。
      const itemStore = useItemStore();
      const exchangeStore = useExchangeStore();
      await Promise.all([itemStore.hydrate(this.sessionId), exchangeStore.hydrate(this.sessionId)]);
      if (this.sessionId) {
        await operationApi.record(this.sessionId, OperationType.LOGIN, `登录账号「${user.nickname}」`);
      }
      message(SESSION_MESSAGES.switched(user.nickname), 'success');
    },

    // 其他标签页登录/切换账号后，本页同步到最新会话并重新按作用域水合。
    async syncFromExternalSession() {
      await this.hydrate();
      if (!this.sessionId) return;
      const itemStore = useItemStore();
      const exchangeStore = useExchangeStore();
      await Promise.all([itemStore.hydrate(this.sessionId), exchangeStore.hydrate(this.sessionId)]);
      message(SESSION_MESSAGES.sessionStale, 'info');
    },

    async updateProfile(draft: Partial<UserDraft>) {
      if (!this.currentUser || !this.sessionId) {
        message(SESSION_MESSAGES.notLoggedIn, 'error');
        return;
      }
      const error = validateUserDraft({ ...this.currentUser, ...draft });
      if (error) {
        message(error, 'error');
        return;
      }
      try {
        this.currentUser = await userApi.updateCurrent(this.sessionId, draft);
        this.users = await userApi.list();
        await operationApi.record(this.sessionId, OperationType.PROFILE_UPDATE, '更新个人资料');
        message('个人资料已更新', 'success');
      } catch (caught) {
        if (isAppError(caught)) message(caught.message, 'error');
        else throw caught;
      }
    },
  },
});

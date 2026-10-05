import { defineStore } from 'pinia';

import { exchangeApi } from '@/api/exchangeApi';
import { ExchangeStatus } from '@/constants/exchange';
import { AUTH_MESSAGES } from '@/constants/messages';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import { isAuthError } from '@/utils/errors';
import { message } from '@/utils/message';
import { useAuthStore } from '@/stores/authStore';
import { useItemStore } from '@/stores/itemStore';

export const useExchangeStore = defineStore('exchanges', {
  state: () => ({
    exchanges: [] as Exchange[],
    statusFilter: 'all' as ExchangeStatus | 'all',
    loading: false,
  }),
  getters: {
    sent: (state) => (userId: string) => state.exchanges.filter((item) => item.from_user_id === userId),
    received: (state) => (userId: string) => state.exchanges.filter((item) => item.to_user_id === userId),
    filtered: (state) => {
      if (state.statusFilter === 'all') return state.exchanges;
      return state.exchanges.filter((item) => item.status === state.statusFilter);
    },
  },
  actions: {
    /** 与首页共用同一聚合读取（exchangeApi.listVisible / itemApi.listVisible）。 */
    async hydrate() {
      this.loading = true;
      try {
        this.exchanges = await exchangeApi.listVisible();
      } finally {
        this.loading = false;
      }
    },

    async handleFailure(caught: unknown) {
      const authStore = useAuthStore();
      if (isAuthError(caught)) {
        await authStore.syncFromExternalSession();
        await this.hydrate();
        message(AUTH_MESSAGES.sessionStale, 'error');
        return;
      }
      message(caught instanceof Error ? caught.message : '操作失败', 'error');
    },

    async create(draft: ExchangeDraft) {
      const authStore = useAuthStore();
      if (!authStore.sessionState) {
        message(AUTH_MESSAGES.sessionExpired, 'error');
        return null;
      }
      try {
        const exchange = await exchangeApi.create(authStore.sessionState, {
          ...draft,
          status: ExchangeStatus.PENDING,
        });
        await this.hydrate();
        message('交换请求已发出', 'success');
        return exchange;
      } catch (caught) {
        await this.handleFailure(caught);
        return null;
      }
    },

    async accept(id: string, expectedRevision?: number) {
      await this.runTransition(id, ExchangeStatus.ACCEPTED, '已同意交换', expectedRevision);
    },

    async reject(id: string, expectedRevision?: number) {
      await this.runTransition(id, ExchangeStatus.REJECTED, '已拒绝交换', expectedRevision);
    },

    async complete(id: string, expectedRevision?: number) {
      await this.runTransition(
        id,
        ExchangeStatus.COMPLETED,
        '交换已完成，双方物品状态已更新',
        expectedRevision,
      );
    },

    async runTransition(
      id: string,
      status: ExchangeStatus,
      successText: string,
      expectedRevision?: number,
    ) {
      const authStore = useAuthStore();
      if (!authStore.sessionState) {
        message(AUTH_MESSAGES.sessionExpired, 'error');
        return;
      }
      try {
        await exchangeApi.transition(authStore.sessionState, id, status, expectedRevision);
        await this.hydrate();
        await useItemStore().hydrate();
        message(successText, 'success');
      } catch (caught) {
        await this.handleFailure(caught);
      }
    },
  },
});

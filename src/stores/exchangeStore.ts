import { defineStore } from 'pinia';

import { catalogApi } from '@/api/catalogApi';
import { exchangeApi } from '@/api/exchangeApi';
import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import { isAppError } from '@/utils/errors';
import { message } from '@/utils/message';

import { useAuthStore } from './authStore';
import { useItemStore } from './itemStore';

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
    // 与首页读取同一快照后再按当前账号过滤，两处结果保证一致。
    async hydrate(sessionId?: string, force = false) {
      const authStore = useAuthStore();
      const sid = sessionId ?? authStore.sessionId;
      this.loading = true;
      try {
        const snapshot = await catalogApi.snapshot(sid, force);
        this.exchanges = snapshot.exchanges.filter(
          (item) => item.from_user_id === authStore.currentUser?.id ||
            item.to_user_id === authStore.currentUser?.id,
        );
      } finally {
        this.loading = false;
      }
    },

    async refreshAfterMutation() {
      const itemStore = useItemStore();
      await itemStore.refreshAfterMutation();
    },

    async runAction(action: () => Promise<unknown>): Promise<boolean> {
      try {
        await action();
        await this.refreshAfterMutation();
        return true;
      } catch (caught) {
        if (isAppError(caught)) {
          message(caught.message, 'error');
          return false;
        }
        throw caught;
      }
    },

    async create(draft: ExchangeDraft) {
      const authStore = useAuthStore();
      try {
        const exchange = await exchangeApi.create(authStore.sessionId, {
          ...draft,
          status: ExchangeStatus.PENDING,
        });
        await this.refreshAfterMutation();
        message('交换请求已发出', 'success');
        return exchange;
      } catch (caught) {
        if (isAppError(caught)) {
          message(caught.message, 'error');
          return null;
        }
        throw caught;
      }
    },

    async accept(id: string) {
      const authStore = useAuthStore();
      const ok = await this.runAction(() =>
        exchangeApi.transition(authStore.sessionId, id, ExchangeStatus.ACCEPTED),
      );
      if (ok) message('已同意交换', 'success');
    },

    async reject(id: string) {
      const authStore = useAuthStore();
      const ok = await this.runAction(() =>
        exchangeApi.transition(authStore.sessionId, id, ExchangeStatus.REJECTED),
      );
      if (ok) message('已拒绝交换', 'success');
    },

    async complete(id: string) {
      const authStore = useAuthStore();
      const ok = await this.runAction(() =>
        exchangeApi.transition(authStore.sessionId, id, ExchangeStatus.COMPLETED),
      );
      if (ok) message('交换已完成，双方物品状态已更新', 'success');
    },
  },
});

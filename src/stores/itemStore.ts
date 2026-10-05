import { defineStore } from 'pinia';
import { orderBy } from 'lodash-es';

import { catalogApi } from '@/api/catalogApi';
import { itemApi } from '@/api/itemApi';
import { ItemStatus } from '@/constants/item';
import { FORM_MESSAGES } from '@/constants/messages';
import type { Item, ItemDraft } from '@/models/item';
import { isAppError } from '@/utils/errors';
import { message } from '@/utils/message';
import { validateItemDraft } from '@/utils/validators';

import { useAuthStore } from './authStore';
import { useExchangeStore } from './exchangeStore';

export const useItemStore = defineStore('items', {
  state: () => ({
    items: [] as Item[],
    keyword: '',
    category: '全部',
    statusFilter: ItemStatus.AVAILABLE as ItemStatus,
    loading: false,
  }),
  getters: {
    visibleItems: (state) => {
      return orderBy(
        state.items.filter((item) => {
          const categoryMatched = state.category === '全部' || item.category === state.category;
          const keywordMatched = `${item.title}${item.description}${item.location}`
            .toLowerCase()
            .includes(state.keyword.toLowerCase());
          return categoryMatched && keywordMatched && item.status === state.statusFilter;
        }),
        ['created_at'],
        ['desc'],
      );
    },
    myItems: (state) => (userId: string) => state.items.filter((item) => item.user_id === userId),
    availableMyItems: (state) => (userId: string) =>
      state.items.filter((item) => item.user_id === userId && item.status === ItemStatus.AVAILABLE),
  },
  actions: {
    // 与交换列表读取同一份目录快照：首页、交换管理看到的物品口径一致。
    async hydrate(sessionId?: string, force = false) {
      const authStore = useAuthStore();
      const sid = sessionId ?? authStore.sessionId;
      this.loading = true;
      try {
        const snapshot = await catalogApi.snapshot(sid, force);
        this.items = snapshot.items;
      } finally {
        this.loading = false;
      }
    },

    // 写后刷新：物品与交换共用同一快照，两个 store 一起重建，结果同源。
    async refreshAfterMutation() {
      const authStore = useAuthStore();
      const exchangeStore = useExchangeStore();
      await Promise.all([
        this.hydrate(authStore.sessionId, true),
        exchangeStore.hydrate(authStore.sessionId, true),
      ]);
    },

    async publish(draft: ItemDraft) {
      const authStore = useAuthStore();
      const error = validateItemDraft(draft);
      if (error) {
        message(error, 'error');
        return null;
      }
      try {
        const item = await itemApi.create(authStore.sessionId, {
          user_id: draft.user_id,
          title: draft.title,
          description: draft.description,
          category: draft.category,
          condition: draft.condition,
          images: [...draft.images],
          location: draft.location,
          status: ItemStatus.AVAILABLE,
        });
        await this.refreshAfterMutation();
        message('物品已发布，等待合适的交换', 'success');
        return item;
      } catch (caught) {
        if (isAppError(caught)) {
          message(caught.message, 'error');
          return null;
        }
        throw caught;
      }
    },

    async offline(itemId: string) {
      const authStore = useAuthStore();
      try {
        await itemApi.setStatus(authStore.sessionId, itemId, ItemStatus.OFFLINE);
        await this.refreshAfterMutation();
        message('物品已下架', 'success');
      } catch (caught) {
        if (isAppError(caught)) {
          message(caught.message, 'error');
          return;
        }
        throw caught;
      }
    },

    assertCanExchange(userId: string) {
      const ownItems = this.availableMyItems(userId);
      if (!ownItems.length) {
        message(FORM_MESSAGES.exchangeNeedOwnItem, 'error');
        return false;
      }
      return true;
    },
  },
});

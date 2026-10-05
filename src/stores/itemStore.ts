import { defineStore } from 'pinia';
import { orderBy } from 'lodash-es';

import { itemApi } from '@/api/itemApi';
import { ItemStatus } from '@/constants/item';
import { AUTH_MESSAGES, FORM_MESSAGES } from '@/constants/messages';
import type { Item, ItemDraft } from '@/models/item';
import { isAuthError } from '@/utils/errors';
import { message } from '@/utils/message';
import { useAuthStore } from '@/stores/authStore';
import { validateItemDraft } from '@/utils/validators';

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
    /** 首页、交换列表都从这一聚合结果读取，保证迁移后口径一致。 */
    async hydrate() {
      this.loading = true;
      try {
        this.items = await itemApi.listVisible();
      } finally {
        this.loading = false;
      }
    },

    async publish(draft: ItemDraft) {
      const authStore = useAuthStore();
      if (!authStore.sessionState) {
        message(AUTH_MESSAGES.sessionExpired, 'error');
        return null;
      }
      const error = validateItemDraft(draft);
      if (error) {
        message(error, 'error');
        return null;
      }
      try {
        const item = await itemApi.create(authStore.sessionState, {
          user_id: authStore.sessionState.userId,
          title: draft.title,
          description: draft.description,
          category: draft.category,
          condition: draft.condition,
          images: [...draft.images],
          location: draft.location,
          status: ItemStatus.AVAILABLE,
        });
        await this.hydrate();
        message('物品已发布，等待合适的交换', 'success');
        return item;
      } catch (caught) {
        message(caught instanceof Error ? caught.message : '发布失败', 'error');
        return null;
      }
    },

    async offline(itemId: string, expectedRevision?: number) {
      const authStore = useAuthStore();
      if (!authStore.sessionState) {
        message(AUTH_MESSAGES.sessionExpired, 'error');
        return;
      }
      try {
        await itemApi.setStatus(authStore.sessionState, itemId, ItemStatus.OFFLINE, expectedRevision);
        await this.hydrate();
        message('物品已下架', 'success');
      } catch (caught) {
        if (isAuthError(caught)) await authStore.syncFromExternalSession();
        message(caught instanceof Error ? caught.message : '操作失败', 'error');
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

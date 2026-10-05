import { onMounted, onUnmounted } from 'vue';

import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { useOperationStore } from '@/stores/operationStore';
import { useAuthStore } from '@/stores/authStore';
import { AUTH_MESSAGES } from '@/constants/messages';
import { message } from '@/utils/message';
import { session } from '@/utils/session';

/**
 * 监听其他标签页的登录动作：
 * 存储中的会话变为更新的 nonce 时，本标签页立刻切到最新会话并重载数据，
 * 防止“两个标签页先后登录，旧标签页再操作写回旧账号”。
 */
export const useSessionSync = () => {
  const handler = async (event: StorageEvent) => {
    const next = session.parseEvent(event);
    if (!next) return;
    const authStore = useAuthStore();
    const previous = authStore.sessionState;
    if (previous && previous.userId === next.userId && previous.nonce === next.nonce) return;

    await authStore.syncFromExternalSession();
    await Promise.all([useItemStore().hydrate(), useExchangeStore().hydrate()]);
    if (authStore.currentUser) {
      await useOperationStore().hydrateFor(authStore.currentUser.id);
    }
    if (previous && previous.nonce !== next.nonce) {
      message(AUTH_MESSAGES.sessionStale, 'info');
    }
  };

  onMounted(() => window.addEventListener('storage', handler));
  onUnmounted(() => window.removeEventListener('storage', handler));
};

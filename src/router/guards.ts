import type { Router } from 'vue-router';

import { ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { LOG_MESSAGES } from '@/constants/messages';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { useMigrationStore } from '@/stores/migrationStore';

export const setupRouterGuards = (router: Router) => {
  router.beforeEach(async () => {
    // 旧数据先迁到各用户作用域；失败不阻断浏览，首页横幅可重试。
    const migrationStore = useMigrationStore();
    if (migrationStore.state.status === 'pending') {
      await migrationStore.init().catch(() => undefined);
    }

    const authStore = useAuthStore();
    const itemStore = useItemStore();
    const exchangeStore = useExchangeStore();

    if (!authStore.sessionId) {
      await authStore.hydrate();
    }
    // 水合前校验会话：读的是当前账号作用域，而不是上个账号的残留。
    if (authStore.sessionId) {
      await Promise.all([
        itemStore.hydrate(authStore.sessionId),
        exchangeStore.hydrate(authStore.sessionId),
      ]);
    }

    const statusProbe = itemStore.items.some((item) => item.status === ItemStatus.AVAILABLE);
    const exchangeProbe = exchangeStore.exchanges.some((item) => item.status === ExchangeStatus.PENDING);
    if (import.meta.env.DEV && (statusProbe || exchangeProbe)) {
      console.debug(LOG_MESSAGES.storageHydrated);
    }
    return true;
  });
};

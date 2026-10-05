<template>
  <van-config-provider :theme="vantTheme">
    <GlobalErrorBoundary>
      <div class="app-shell">
        <header class="topbar">
          <RouterLink class="brand" to="/home">
            <span>ReSwap</span>
            <small>物尽其用</small>
          </RouterLink>
          <nav>
            <RouterLink to="/home">首页</RouterLink>
            <RouterLink to="/publish">发布</RouterLink>
            <RouterLink to="/exchanges">交换</RouterLink>
            <RouterLink to="/profile">我的</RouterLink>
          </nav>
          <button class="theme-toggle" type="button" @click="themeStore.toggle">
            {{ themeStore.token.label }}
          </button>
        </header>

        <div v-if="migrationStore.hasFailed" class="migration-banner" role="alert">
          <span>{{ AUTH_MESSAGES.migrationFailed }}<template v-if="migrationStore.errorText">：{{ migrationStore.errorText }}</template></span>
          <button type="button" :disabled="migrationStore.running" @click="retryMigration">
            {{ AUTH_MESSAGES.migrationRetry }}
          </button>
        </div>

        <main>
          <RouterView />
        </main>
      </div>
    </GlobalErrorBoundary>
  </van-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { ConfigProvider as VanConfigProvider } from 'vant';

import GlobalErrorBoundary from '@/components/common/GlobalErrorBoundary';
import { AUTH_MESSAGES } from '@/constants/messages';
import { useSessionSync } from '@/hooks/useSessionSync';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { useMigrationStore } from '@/stores/migrationStore';
import { useOperationStore } from '@/stores/operationStore';
import { useThemeStore } from '@/stores/themeStore';
import { toVantTheme } from '@/utils/themeUtils';

const authStore = useAuthStore();
const itemStore = useItemStore();
const exchangeStore = useExchangeStore();
const operationStore = useOperationStore();
const migrationStore = useMigrationStore();
const themeStore = useThemeStore();
const vantTheme = computed(() => toVantTheme(themeStore.theme));

useSessionSync();

const reloadUserData = async () => {
  await Promise.all([itemStore.hydrate(), exchangeStore.hydrate()]);
  if (authStore.currentUser) {
    await operationStore.hydrateFor(authStore.currentUser.id);
  }
};

onMounted(async () => {
  themeStore.hydrate();
  await migrationStore.hydrate();
  await authStore.hydrate();
  await reloadUserData();
});

// 本标签页切换账号后，同样按最新会话重新读取各用户作用域数据。
watch(
  () => authStore.sessionState?.nonce,
  async (nonce, previous) => {
    if (nonce && nonce !== previous) {
      await reloadUserData();
    }
  },
);

const retryMigration = async () => {
  const result = await migrationStore.retry();
  if (result.status === 'done') {
    await authStore.hydrate();
    await reloadUserData();
  }
};
</script>

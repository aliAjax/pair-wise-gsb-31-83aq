<template>
  <van-config-provider :theme="vantTheme">
    <GlobalErrorBoundary>
      <div class="app-shell">
        <MigrationBanner />
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
        <main>
          <RouterView />
        </main>
      </div>
    </GlobalErrorBoundary>
  </van-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { ConfigProvider as VanConfigProvider } from 'vant';

import GlobalErrorBoundary from '@/components/common/GlobalErrorBoundary';
import MigrationBanner from '@/components/common/MigrationBanner.vue';
import { sessionApi } from '@/api/sessionApi';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { toVantTheme } from '@/utils/themeUtils';

const authStore = useAuthStore();
const themeStore = useThemeStore();
const vantTheme = computed(() => toVantTheme(themeStore.theme));

let unsubscribe: (() => void) | undefined;

onMounted(() => {
  themeStore.hydrate();
  // 另一个标签页登录/切换账号后，本页会话作废并同步到最新账号作用域。
  unsubscribe = sessionApi.onChange((session) => {
    if (session?.sessionId !== authStore.sessionId) {
      void authStore.syncFromExternalSession();
    }
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>

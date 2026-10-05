<template>
  <div v-if="migrationStore.failed" class="migration-banner">
    <span>{{ MIGRATION_MESSAGES.failed }}</span>
    <button type="button" :disabled="migrationStore.running" @click="retry">
      {{ migrationStore.running ? MIGRATION_MESSAGES.retrying : '重试迁移' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { MIGRATION_MESSAGES } from '@/constants/messages';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { useMigrationStore } from '@/stores/migrationStore';

const migrationStore = useMigrationStore();
const authStore = useAuthStore();
const itemStore = useItemStore();
const exchangeStore = useExchangeStore();

const retry = async () => {
  await migrationStore.run();
  if (migrationStore.done) {
    await authStore.hydrate();
    if (authStore.sessionId) {
      await Promise.all([
        itemStore.hydrate(authStore.sessionId, true),
        exchangeStore.hydrate(authStore.sessionId, true),
      ]);
    }
  }
};
</script>

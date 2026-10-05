import { defineStore } from 'pinia';

import { migrationApi } from '@/api/migrationApi';
import { MIGRATION_MESSAGES } from '@/constants/messages';
import type { MigrationState } from '@/types';
import { message } from '@/utils/message';

const initialState: MigrationState = { status: 'pending', attempts: 0 };

export const useMigrationStore = defineStore('migration', {
  state: () => ({
    state: { ...initialState } as MigrationState,
    running: false,
  }),
  getters: {
    failed: (state) => state.state.status === 'failed',
    done: (state) => state.state.status === 'done',
  },
  actions: {
    async init() {
      this.state = await migrationApi.getState();
      if (this.state.status === 'done') return;
      await this.run();
    },
    async run() {
      if (this.running) return;
      this.running = true;
      try {
        this.state = await migrationApi.run();
      } catch (error) {
        this.state = await migrationApi.getState();
        message(MIGRATION_MESSAGES.failed, 'error');
        throw error;
      } finally {
        this.running = false;
      }
    },
  },
});

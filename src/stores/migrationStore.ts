import { defineStore } from 'pinia';

import { migrationApi } from '@/api/migrationApi';
import type { MigrationState } from '@/types';
import { message } from '@/utils/message';

export const useMigrationStore = defineStore('migration', {
  state: () => ({
    state: { status: 'pending', attemptedAt: '' } as MigrationState,
    running: false,
  }),
  getters: {
    isDone: (state) => state.state.status === 'done',
    hasFailed: (state) => state.state.status === 'failed',
    errorText: (state) => state.state.error ?? '',
  },
  actions: {
    async hydrate() {
      this.state = await migrationApi.getState();
    },

    /** 启动迁移（main.ts 中先于业务数据加载执行）。 */
    async ensure() {
      this.running = true;
      try {
        this.state = await migrationApi.run();
      } finally {
        this.running = false;
      }
      return this.state;
    },

    /** 迁移失败后的可重试入口。 */
    async retry() {
      this.running = true;
      try {
        this.state = await migrationApi.retry();
        if (this.state.status === 'done') {
          message('历史数据已迁移完成', 'success');
        } else {
          message(this.state.error ?? '迁移仍未完成，请稍后重试', 'error');
        }
      } finally {
        this.running = false;
      }
      return this.state;
    },
  },
});

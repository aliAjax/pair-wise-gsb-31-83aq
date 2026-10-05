import { defineStore } from 'pinia';

import { operationLogApi } from '@/api/operationLogApi';
import type { OperationLog } from '@/models/operationLog';

/** 当前用户作用域内的操作记录，切换账号后随会话重新读取。 */
export const useOperationStore = defineStore('operations', {
  state: () => ({
    logs: [] as OperationLog[],
    loading: false,
  }),
  actions: {
    async hydrateFor(userId: string) {
      this.loading = true;
      try {
        this.logs = await operationLogApi.listByUser(userId);
      } finally {
        this.loading = false;
      }
    },
  },
});

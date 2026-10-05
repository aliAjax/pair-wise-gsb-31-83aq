import { ref, watch, type Ref } from 'vue';

import { operationApi } from '@/api/operationApi';
import type { OperationLog } from '@/models/operationLog';

// 当前账号的操作记录：只读本用户作用域，会话或账号变化后重新拉取。
export const useOperationLogs = (sessionId: Ref<string>) => {
  const logs = ref<OperationLog[]>([]);
  const loading = ref(false);

  const refresh = async () => {
    if (!sessionId.value) {
      logs.value = [];
      return;
    }
    loading.value = true;
    try {
      logs.value = await operationApi.listMine(sessionId.value);
    } finally {
      loading.value = false;
    }
  };

  watch(sessionId, refresh, { immediate: true });

  return { logs, loading, refresh };
};

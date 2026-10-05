import { OperationType, type OperationLog } from '@/models/operationLog';

import { sessionApi } from './sessionApi';
import { storage } from '@/utils/storage';

const appendLog = async (
  userId: string,
  type: OperationType,
  detail: string,
  retries = 3,
): Promise<OperationLog> => {
  const log: OperationLog = {
    id: storage.createId('op'),
    user_id: userId,
    type,
    detail,
    created_at: new Date().toISOString(),
  };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // 只读 revision，不持有键锁；随后 compareSetScoped 在锁内重读并校验。
    const collection = await storage.readScopedRaw<OperationLog>('operations', userId);
    try {
      await storage.compareSetScoped<OperationLog>('operations', userId, collection.revision, (rows) => [
        log,
        ...rows,
      ]);
      return log;
    } catch (error) {
      if (attempt === retries) throw error;
    }
  }
  return log;
};

export const operationApi = {
  // 操作记录属于当前账号的私有作用域，追加前先校验会话与归属。
  async record(sessionId: string, type: OperationType, detail: string): Promise<OperationLog | null> {
    const session = await sessionApi.assert(sessionId);
    return appendLog(session.userId, type, detail);
  },

  async listMine(sessionId: string): Promise<OperationLog[]> {
    const session = await sessionApi.assert(sessionId);
    const collection = await storage.getScoped<OperationLog>('operations', session.userId);
    return collection.rows;
  },
};

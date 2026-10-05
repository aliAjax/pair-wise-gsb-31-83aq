import type { OperationLog } from '@/models/operationLog';

import { scopeKey, storage } from '@/utils/storage';
import { session } from '@/utils/session';

interface AppendLogParams {
  /** 写入哪个用户作用域（物品/交换请求的归属视角）。 */
  scopeUserId: string;
  action: string;
  detail: string;
  target_id?: string;
}

export const operationLogApi = {
  /** 读取某用户作用域内的操作记录，迁移与运行期共用同一结果。 */
  async listByUser(userId: string): Promise<OperationLog[]> {
    return storage.get<OperationLog[]>(scopeKey('logs', userId), []);
  },

  /**
   * 追加操作记录：
   * - 先校验调用方持有的会话是最新会话（拒绝旧标签页写回）；
   * - 记录归属到目标用户作用域，交换类操作会给对方作用域也写一条对方视角的记录。
   */
  async append(
    claim: { userId: string; nonce: string },
    params: AppendLogParams,
  ): Promise<OperationLog> {
    await session.assert(claim);
    const entry: OperationLog = {
      id: storage.createId('log'),
      // 记录归属到目标作用域用户：每个用户只能看到自己作用域内的活动。
      // 对方触发的动作（如“交换请求被同意”）也写入自己的作用域，动作语义由 action 区分。
      user_id: params.scopeUserId,
      action: params.action,
      detail: params.detail,
      target_id: params.target_id,
      created_at: new Date().toISOString(),
    };
    await storage.update<OperationLog[]>(
      scopeKey('logs', params.scopeUserId),
      (previous) => [entry, ...previous],
      [],
    );
    return entry;
  },
};

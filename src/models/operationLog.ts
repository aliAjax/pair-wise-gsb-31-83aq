/** 操作记录：只属于某一个用户作用域，按用户隔离。 */
export interface OperationLog {
  id: string;
  /** 作用域归属用户；对方触发的动作也会以该用户视角记录在自己的作用域。 */
  user_id: string;
  action: string;
  detail: string;
  /** 关联物品 / 交换请求 id，便于跨页追踪。 */
  target_id?: string;
  created_at: string;
}

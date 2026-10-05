/** 会话失效 / 过期：存储中的最新会话与提交方持有的会话不一致。 */
export class SessionError extends Error {
  constructor(message = '登录状态已失效，请重新登录') {
    super(message);
    this.name = 'SessionError';
  }
}

/** 越权：会话用户不是目标数据的归属者。 */
export class PermissionError extends Error {
  constructor(message = '无权操作他人的数据') {
    super(message);
    this.name = 'PermissionError';
  }
}

export const isAuthError = (error: unknown): boolean =>
  error instanceof SessionError || error instanceof PermissionError;

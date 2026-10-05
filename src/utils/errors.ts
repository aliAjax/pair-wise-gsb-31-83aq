export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SessionStaleError extends AppError {
  constructor(message = '登录态已失效，请刷新页面后使用最新账号操作') {
    super(message);
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message = '无权操作他人的数据') {
    super(message);
  }
}

export class ConflictError extends AppError {
  constructor(message = '数据已被其他页面更新，当前操作基于旧结果，请重试') {
    super(message);
  }
}

export class MigrationError extends AppError {
  constructor(message = '旧数据迁移失败，可点击重试') {
    super(message);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

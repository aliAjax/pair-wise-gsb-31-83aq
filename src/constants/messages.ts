import { ExchangeStatus } from './exchange';
import { ItemStatus } from './item';

export const PAGE_MESSAGES = {
  homeEmpty: '暂时没有符合条件的闲置物品',
  publishReady: '发布后会写入当前账号的本地作用域（localStorage 与 IndexedDB）',
  exchangeEmpty: '还没有交换请求，先去首页挑一件合眼缘的物品',
  profileUpdated: '个人资料已更新',
};

export const FORM_MESSAGES = {
  requiredTitle: '物品标题不能为空',
  requiredDescription: '请描述你希望交换的物品',
  requiredPhone: '请填写联系方式',
  imageLimit: '最多上传 4 张图片',
  exchangeNeedOwnItem: '请先发布一件可交换物品',
};

export const AUTH_MESSAGES = {
  sessionExpired: '登录状态已失效，请重新登录',
  sessionStale: '检测到账号已切换，已为你刷新到最新登录账号',
  forbiddenItem: '不能修改他人的物品',
  forbiddenExchange: '只有交换双方可以操作该请求',
  forbiddenActor: '只能以当前登录账号发起操作',
  migrationFailed: '旧数据迁移未完成，部分历史内容暂不可见',
  migrationRetry: '重试迁移',
};

export const LOG_MESSAGES = {
  storageHydrated: 'storage hydrated with per-user scopes',
  itemStatusUsed: `ItemStatus includes ${ItemStatus.AVAILABLE}, ${ItemStatus.EXCHANGED}, ${ItemStatus.OFFLINE}`,
  exchangeStatusUsed: `ExchangeStatus includes ${ExchangeStatus.PENDING}, ${ExchangeStatus.ACCEPTED}, ${ExchangeStatus.REJECTED}, ${ExchangeStatus.COMPLETED}`,
  sessionRefreshed: 'session refreshed from latest tab',
  sessionRejected: 'stale session write rejected',
  migrationDone: 'legacy data migrated into per-user scopes',
};

export const STATUS_MESSAGE_MAP = {
  [ItemStatus.AVAILABLE]: '这件物品可发起交换',
  [ItemStatus.EXCHANGED]: '这件物品已完成交换',
  [ItemStatus.OFFLINE]: '这件物品已下架',
  [ExchangeStatus.PENDING]: '等待对方确认',
  [ExchangeStatus.ACCEPTED]: '交换已同意，可确认完成',
  [ExchangeStatus.REJECTED]: '交换请求已拒绝',
  [ExchangeStatus.COMPLETED]: '交换流程已完成',
};

import { ExchangeStatus } from './exchange';
import { ItemStatus } from './item';
import { OperationType } from '@/models/operationLog';

export const PAGE_MESSAGES = {
  homeEmpty: '暂时没有符合条件的闲置物品',
  publishReady: '发布后会写入当前账号的私有作用域',
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

export const SESSION_MESSAGES = {
  switched: (nickname: string) => `已切换为 ${nickname}`,
  sessionStale: '登录态已在其他标签页变更，请刷新后使用最新账号操作',
  permissionDenied: '越权请求已拒绝：该数据不属于当前账号',
  conflict: '数据已被其他页面更新，本次提交基于旧结果，已为你刷新，请重试',
  notLoggedIn: '尚未登录，请先选择本地账号',
};

export const MIGRATION_MESSAGES = {
  failed: '旧数据迁移失败，部分历史物品与交换请求暂不可见',
  retrying: '正在重新迁移旧数据…',
  done: '旧数据已按账号归属迁移完成',
};

export const LOG_MESSAGES = {
  storageHydrated: 'storage hydrated with user scopes and session revision',
  itemStatusUsed: `ItemStatus includes ${ItemStatus.AVAILABLE}, ${ItemStatus.EXCHANGED}, ${ItemStatus.OFFLINE}`,
  exchangeStatusUsed: `ExchangeStatus includes ${ExchangeStatus.PENDING}, ${ExchangeStatus.ACCEPTED}, ${ExchangeStatus.REJECTED}, ${ExchangeStatus.COMPLETED}`,
  sessionSynced: 'session synced from another tab',
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

export const OPERATION_LABEL_MAP: Record<OperationType, string> = {
  [OperationType.LOGIN]: '登录账号',
  [OperationType.ITEM_PUBLISH]: '发布物品',
  [OperationType.ITEM_UPDATE]: '编辑物品',
  [OperationType.ITEM_OFFLINE]: '下架物品',
  [OperationType.EXCHANGE_CREATE]: '发起交换',
  [OperationType.EXCHANGE_ACCEPT]: '同意交换',
  [OperationType.EXCHANGE_REJECT]: '拒绝交换',
  [OperationType.EXCHANGE_COMPLETE]: '完成交换',
  [OperationType.PROFILE_UPDATE]: '更新资料',
};

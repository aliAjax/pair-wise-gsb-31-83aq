export enum OperationType {
  LOGIN = 'login',
  ITEM_PUBLISH = 'item_publish',
  ITEM_UPDATE = 'item_update',
  ITEM_OFFLINE = 'item_offline',
  EXCHANGE_CREATE = 'exchange_create',
  EXCHANGE_ACCEPT = 'exchange_accept',
  EXCHANGE_REJECT = 'exchange_reject',
  EXCHANGE_COMPLETE = 'exchange_complete',
  PROFILE_UPDATE = 'profile_update',
}

export interface OperationLog {
  id: string;
  user_id: string;
  type: OperationType;
  detail: string;
  created_at: string;
}

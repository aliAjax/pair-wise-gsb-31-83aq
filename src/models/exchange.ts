import { ExchangeStatus } from '@/constants/exchange';

export interface Exchange {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_item_id: string;
  to_item_id: string;
  status: ExchangeStatus;
  message: string;
  created_at: string;
  updated_at: string;
  /**
   * 单调递增的版本号：发起后每次状态流转 +1。
   * 交换记录在双方作用域各存一份，合并时以 revision 更大的结果为准。
   */
  revision: number;
}

export type ExchangeDraft = Omit<Exchange, 'id' | 'status' | 'created_at' | 'updated_at' | 'revision'> & {
  status?: ExchangeStatus;
};

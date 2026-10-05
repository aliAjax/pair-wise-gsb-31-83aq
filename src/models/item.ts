import { ItemCondition, ItemStatus } from '@/constants/item';

export interface Item {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition;
  images: string[];
  status: ItemStatus;
  location: string;
  created_at: string;
  /**
   * 单调递增的版本号：同一物品每次写入 +1。
   * 多标签页并发提交时，以 revision 更大的结果为准，杜绝旧结果覆盖新结果。
   */
  revision: number;
}

export type ItemDraft = Omit<Item, 'id' | 'status' | 'created_at' | 'revision'> & {
  status?: ItemStatus;
};

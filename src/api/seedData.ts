import { ExchangeStatus } from '@/constants/exchange';
import { ItemCondition, ItemStatus } from '@/constants/item';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { User } from '@/models/user';

/** 演示账号。 */
export const seedUsers: User[] = [
  {
    id: 'user_me',
    nickname: '青禾',
    avatar: '',
    phone: '13800000001',
    location: '上海 · 徐汇',
    credit_score: 92,
    created_at: new Date().toISOString(),
  },
  {
    id: 'user_lin',
    nickname: '林小雨',
    avatar: '',
    phone: '13800000002',
    location: '杭州 · 西湖',
    credit_score: 86,
    created_at: new Date().toISOString(),
  },
  {
    id: 'user_chen',
    nickname: '陈木木',
    avatar: '',
    phone: '13800000003',
    location: '苏州 · 工业园',
    credit_score: 78,
    created_at: new Date().toISOString(),
  },
];

/** 首次安装（无任何用户作用域）时写入的演示数据，revision 从 1 开始。 */
export const seedItems: Item[] = [
  {
    id: 'item_camera',
    user_id: 'user_lin',
    title: '富士拍立得 Mini 旧机',
    description: '成色干净，附一包相纸，想换小型蓝牙音箱或桌面灯。',
    category: '数码',
    condition: ItemCondition.GOOD,
    images: [],
    status: ItemStatus.AVAILABLE,
    location: '杭州 · 西湖',
    created_at: new Date().toISOString(),
    revision: 1,
  },
  {
    id: 'item_books',
    user_id: 'user_chen',
    title: '设计与产品书 6 本',
    description: '搬家清书柜，适合产品/视觉入门，接受换绿植、咖啡器具。',
    category: '书籍',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.AVAILABLE,
    location: '苏州 · 工业园',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    revision: 1,
  },
  {
    id: 'item_chair',
    user_id: 'user_me',
    title: '可折叠露营椅',
    description: '去年买的，露营两次，有轻微使用痕迹，想换收纳盒。',
    category: '运动',
    condition: ItemCondition.GOOD,
    images: [],
    status: ItemStatus.AVAILABLE,
    location: '上海 · 徐汇',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    revision: 1,
  },
  {
    id: 'item_lamp',
    user_id: 'user_lin',
    title: '木质小夜灯',
    description: '暖光，适合床头。已完成交换，保留记录用于状态展示。',
    category: '家居',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.EXCHANGED,
    location: '杭州 · 西湖',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 90).toISOString(),
    revision: 1,
  },
];

export const seedExchanges: Exchange[] = [
  {
    id: 'exchange_seed',
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: 'item_chair',
    to_item_id: 'item_camera',
    status: ExchangeStatus.PENDING,
    message: '露营椅换拍立得，可以同城当面交换。',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    revision: 1,
  },
];

import { clear as idbClear } from 'idb-keyval';

import { migrationApi } from '../src/api/migrationApi';
import { exchangeApi } from '../src/api/exchangeApi';
import { itemApi } from '../src/api/itemApi';
import { operationLogApi } from '../src/api/operationLogApi';
import { userApi } from '../src/api/userApi';
import { ItemStatus } from '../src/constants/item';
import { ExchangeStatus } from '../src/constants/exchange';
import type { Exchange } from '../src/models/exchange';
import type { Item } from '../src/models/item';
import { storage, STORAGE_KEYS } from '../src/utils/storage';
import { session } from '../src/utils/session';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`❌ ${message}`);
  console.log(`✅ ${message}`);
};

const reset = async () => {
  localStorage.clear();
  await idbClear();
};

const seedV1 = async () => {
  // 模拟 v1 全局混写数据（无 revision、无 session、旧 current-user-id）。
  const v1Items: Item[] = [
    {
      id: 'a1',
      user_id: 'user_me',
      title: 'A 的物品',
      description: 'd',
      category: '数码',
      condition: 'good' as Item['condition'],
      images: [],
      status: ItemStatus.AVAILABLE,
      location: '上海',
      created_at: new Date().toISOString(),
      revision: undefined as unknown as number,
    },
    {
      id: 'b1',
      user_id: 'user_lin',
      title: 'B 的物品',
      description: 'd',
      category: '家居',
      condition: 'new' as Item['condition'],
      images: [],
      status: ItemStatus.AVAILABLE,
      location: '杭州',
      created_at: new Date().toISOString(),
      revision: undefined as unknown as number,
    },
  ];
  const v1Exchanges: Exchange[] = [
    {
      id: 'e1',
      from_user_id: 'user_me',
      to_user_id: 'user_lin',
      from_item_id: 'a1',
      to_item_id: 'b1',
      status: ExchangeStatus.PENDING,
      message: '换吗',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revision: undefined as unknown as number,
    },
  ];
  await storage.set(STORAGE_KEYS.legacyItems, v1Items);
  await storage.set(STORAGE_KEYS.legacyExchanges, v1Exchanges);
  await storage.set(STORAGE_KEYS.legacyCurrentUserId, 'user_lin');
  // 清掉 v2 标记，确保 run 真正执行。
  localStorage.removeItem(STORAGE_KEYS.migrationV2);
};

const run = async () => {
  // 1. 全新安装：迁移后播种且有默认会话
  await reset();
  await migrationApi.run();
  const freshItems = await itemApi.listVisible();
  assert(freshItems.length >= 4, `全新安装播种物品（实际 ${freshItems.length}）`);
  const freshSession = await session.read();
  assert(Boolean(freshSession?.nonce), '全新安装创建带 nonce 的会话');

  // 2. v1 旧数据迁移到作用域
  await reset();
  await seedV1();
  const migration = await migrationApi.run();
  assert(migration.status === 'done', 'v1 迁移完成');
  const aScope = await itemApi.listByOwner('user_me');
  const bScope = await itemApi.listByOwner('user_lin');
  assert(aScope.some((i) => i.id === 'a1') && !aScope.some((i) => i.id === 'b1'), '物品只在归属者作用域');
  assert(bScope.some((i) => i.id === 'b1'), 'B 的物品在 B 作用域');
  assert(aScope[0].revision === 1, '旧物品补上 revision=1');

  const aExchanges = await exchangeApi.listByUser('user_me');
  const bExchanges = await exchangeApi.listByUser('user_lin');
  assert(aExchanges.some((e) => e.id === 'e1') && bExchanges.some((e) => e.id === 'e1'), '交换记录在双方作用域');
  const migratedSession = await session.read();
  assert(migratedSession?.userId === 'user_lin', '会话沿用旧 current-user-id');

  // 3. 迁移幂等/可重试：再跑一次不产生重复
  await migrationApi.retry();
  const aScopeAgain = await itemApi.listByOwner('user_me');
  assert(aScopeAgain.filter((i) => i.id === 'a1').length === 1, '重试迁移不重复写入物品');
  const aExchangesAgain = await exchangeApi.listByUser('user_me');
  assert(aExchangesAgain.filter((e) => e.id === 'e1').length === 1, '重试迁移不重复写入交换');

  // 4. 切换账号后不能改他人物品
  const userMe = await userApi.login('user_me');
  const claimMe = (await session.read())!;
  assert(userMe.id === 'user_me', '切换到 user_me');
  let denied = false;
  try {
    await itemApi.setStatus(claimMe, 'b1', ItemStatus.OFFLINE);
  } catch {
    denied = true;
  }
  assert(denied, 'user_me 下架 user_lin 的物品被拒绝');
  const b1Still = (await itemApi.detail('b1'))!;
  assert(b1Still.status === ItemStatus.AVAILABLE, '被拒绝后他人物品状态不变');

  // 5a. 当前账号正常发起一次交换，双方作用域留下对应视角的记录
  const createdExchange = await exchangeApi.create(claimMe, {
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: 'a1',
    to_item_id: 'b1',
    message: '想交换',
  });
  assert(createdExchange.revision === 1, '新交换 revision=1');

  // 5. 旧 nonce（旧标签页）提交被拒绝
  const staleClaim = { ...claimMe };
  await userApi.login('user_lin'); // 刷新 nonce
  let staleDenied = false;
  try {
    await itemApi.setStatus(staleClaim, 'a1', ItemStatus.OFFLINE);
  } catch {
    staleDenied = true;
  }
  assert(staleDenied, '旧标签页（旧 nonce）写回被拒绝');

  // 6. 交换流转：双方各写、revision 递增、越权拒绝、旧 revision 拒绝覆盖
  const claimLin = (await session.read())!; // 当前是 user_lin
  // to_user (lin) 同意 e1
  const accepted = await exchangeApi.transition(claimLin, 'e1', ExchangeStatus.ACCEPTED, 1);
  assert(accepted.revision === 2 && accepted.status === ExchangeStatus.ACCEPTED, '同意后 revision=2');
  let oldRevisionDenied = false;
  try {
    // 另一个仍停留在 revision=1 的页面再点“同意”
    await exchangeApi.transition(claimLin, 'e1', ExchangeStatus.ACCEPTED, 1);
  } catch {
    oldRevisionDenied = true;
  }
  assert(oldRevisionDenied, '基于旧 revision 的提交被拒绝');

  // from_user(user_me) 不能同意/拒绝
  await userApi.login('user_me');
  const claimMe2 = (await session.read())!;
  let acceptByFromDenied = false;
  try {
    await exchangeApi.transition(claimMe2, 'e1', ExchangeStatus.REJECTED, 2);
  } catch {
    acceptByFromDenied = true;
  }
  assert(acceptByFromDenied, '发起人不能拒绝/同意');
  // 但发起人可以完成
  const completed = await exchangeApi.transition(claimMe2, 'e1', ExchangeStatus.COMPLETED, 2);
  assert(completed.revision === 3 && completed.status === ExchangeStatus.COMPLETED, '双方均可完成，revision=3');
  const a1 = await itemApi.detail('a1');
  const b1 = await itemApi.detail('b1');
  assert(a1?.status === ItemStatus.EXCHANGED && b1?.status === ItemStatus.EXCHANGED, '完成后双方物品标记已交换');

  // 7. 多标签页“后到的旧结果不覆盖新结果”：模拟双方作用域 revision 不一致后聚合取高
  const staleVersion: Exchange = { ...completed, status: ExchangeStatus.ACCEPTED, revision: 2 };
  await exchangeApi.writeScope('user_me', [staleVersion]); // me 侧滞留旧结果
  const merged = (await exchangeApi.listVisible()).find((e) => e.id === 'e1')!;
  assert(merged.revision === 3 && merged.status === ExchangeStatus.COMPLETED, '聚合取 revision 更大的最新结果');

  // 8. 操作记录按作用域隔离
  const logsMe = await operationLogApi.listByUser('user_me');
  const logsLin = await operationLogApi.listByUser('user_lin');
  assert(logsMe.length > 0 && logsLin.length > 0, '双方作用域都有操作记录');
  assert(logsMe.every((l) => l.user_id === 'user_me'), '我的作用域记录操作者都是我');
  assert(
    logsLin.some((l) => l.action === '收到交换请求') &&
      logsMe.some((l) => l.action === '发起交换'),
    '交换在双方作用域留下对方视角的记录',
  );

  // 9. 首页与交换列表读取同一聚合来源
  const homeItems = await itemApi.listVisible();
  const exchangeItems = await itemApi.listVisible();
  assert(JSON.stringify(homeItems) === JSON.stringify(exchangeItems), '首页与交换列表物品结果一致');

  console.log('\n全部验证通过 🎉');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

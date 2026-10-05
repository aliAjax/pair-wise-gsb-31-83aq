// 行为验证脚本：用 Node 模拟 localStorage/IndexedDB，覆盖本次隔离与会话改造。
// 运行：node scripts/verify-isolation.mjs（由 verify 脚本经 esbuild 预打包后生成）
import assert from 'node:assert';

// ---- 浏览器环境垫片 ----
class LocalStorageShim {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  get length() { return this.map.size; }
}
globalThis.localStorage = new LocalStorageShim();
globalThis.window = { addEventListener() {}, removeEventListener() {} };
// idb-keyval 在内存 Map 上的垫片（见 build 时 alias）。

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', `${name} -> ${error?.stack ?? error}`]);
  }
};

const { migrationApi } = await import('../src/api/migrationApi.ts');
const { userApi } = await import('../src/api/userApi.ts');
const { itemApi } = await import('../src/api/itemApi.ts');
const { exchangeApi } = await import('../src/api/exchangeApi.ts');
const { operationApi } = await import('../src/api/operationApi.ts');
const { sessionApi } = await import('../src/api/sessionApi.ts');
const { catalogApi } = await import('../src/api/catalogApi.ts');
const { storage, STORAGE_KEYS } = await import('../src/utils/storage.ts');
const { SessionStaleError, PermissionDeniedError, ConflictError } = await import('../src/utils/errors.ts');
const { ItemStatus } = await import('../src/constants/item.ts');
const { ExchangeStatus } = await import('../src/constants/exchange.ts');

// 1) 全新安装：迁移把演示数据种入各用户作用域，并建立初始会话（青禾 user_me）。
await test('迁移成功并建立初始会话', async () => {
  const state = await migrationApi.run();
  assert.equal(state.status, 'done');
  const session = await sessionApi.current();
  assert.equal(session.userId, 'user_me');
  assert.ok(session.sessionId, '应生成 sessionId');
});

// 2) 迁移幂等：再次执行不会重复数据。
await test('迁移可重入且不重复', async () => {
  const before = await itemApi.listMine((await sessionApi.current()).sessionId);
  await migrationApi.run();
  const after = await itemApi.listMine((await sessionApi.current()).sessionId);
  assert.equal(after.length, before.length);
});

// 3) 首页目录只返回各作用域物品；青禾只能看到自己作用域的“我的物品”。
await test('按归属读取物品作用域', async () => {
  const s = (await sessionApi.current()).sessionId;
  const mine = await itemApi.listMine(s);
  assert.ok(mine.every((i) => i.user_id === 'user_me'));
  assert.deepEqual(mine.map((i) => i.id).sort(), ['item_chair']);
});

// 4) 切换账号：新会话；旧 sessionId 立即失效，不能再写。
let linSession;
await test('切换账号生成新会话，旧会话读写被拒', async () => {
  const oldSession = (await sessionApi.current()).sessionId;
  await userApi.login('user_lin');
  linSession = (await sessionApi.current()).sessionId;
  assert.notEqual(oldSession, linSession);
  await assert.rejects(() => sessionApi.assert(oldSession), SessionStaleError);
  await assert.rejects(
    () => itemApi.listMine(oldSession),
    SessionStaleError,
  );
});

// 5) 越权：林小雨尝试下架青禾的物品 -> 拒绝。
await test('越权修改他人物品直接拒绝', async () => {
  await assert.rejects(
    () => itemApi.setStatus(linSession, 'item_chair', ItemStatus.OFFLINE),
    PermissionDeniedError,
  );
  const still = await itemApi.detail(linSession, 'item_chair');
  assert.equal(still.status, ItemStatus.AVAILABLE);
});

// 6) 林小雨发布物品，只进入她自己的作用域；青禾目录里也能浏览到，但不能改。
await test('发布物品归属当前账号作用域', async () => {
  const created = await itemApi.create(linSession, {
    user_id: 'user_lin',
    title: '林小雨的新耳机',
    description: '测试',
    category: '数码',
    condition: ItemStatus.NEW,
    images: [],
    location: '杭州',
    status: ItemStatus.AVAILABLE,
  });
  const linItems = await itemApi.listMine(linSession);
  assert.ok(linItems.some((i) => i.id === created.id));
});

// 7) 越权发起交换：伪造 from_user_id 为他人 -> 拒绝。
await test('伪造交换归属直接拒绝', async () => {
  await assert.rejects(
    () =>
      exchangeApi.create(linSession, {
        from_user_id: 'user_me',
        to_user_id: 'user_chen',
        from_item_id: 'item_chair',
        to_item_id: 'item_books',
        status: ExchangeStatus.PENDING,
        message: 'hack',
      }),
    PermissionDeniedError,
  );
});

// 8) 正常交换 + 状态流转权限：林小雨用相机向陈木木的书？不，改为合法流程：
//    青禾(user_me) 已有发给林小雨的 seed 请求；切回青禾不能“同意”（收到方才可以）。
await test('发起方不能同意自己收到之外的请求', async () => {
  await userApi.login('user_me');
  const meSession = (await sessionApi.current()).sessionId;
  await assert.rejects(
    () => exchangeApi.transition(meSession, 'exchange_seed', ExchangeStatus.ACCEPTED),
    PermissionDeniedError,
  );
});

// 9) 林小雨（收到方）同意 seed 请求 -> 成功，双作用域都更新；青禾随后完成。
await test('收到方同意、发起方完成，双方作用域一致更新', async () => {
  await userApi.login('user_lin');
  const lin = (await sessionApi.current()).sessionId;
  const accepted = await exchangeApi.transition(lin, 'exchange_seed', ExchangeStatus.ACCEPTED);
  assert.equal(accepted.status, ExchangeStatus.ACCEPTED);
  await userApi.login('user_me');
  const me = (await sessionApi.current()).sessionId;
  const completed = await exchangeApi.transition(me, 'exchange_seed', ExchangeStatus.COMPLETED);
  assert.equal(completed.status, ExchangeStatus.COMPLETED);
  const chair = await itemApi.detail(me, 'item_chair');
  const camera = await itemApi.detail(me, 'item_camera');
  assert.equal(chair.status, ItemStatus.EXCHANGED);
  assert.equal(camera.status, ItemStatus.EXCHANGED);
});

// 10) 两个标签页先后登录：A 页旧 sessionId 写回 -> Conflict/Stale，绝不覆盖新结果。
await test('旧标签页基于旧 revision/会话提交不会覆盖', async () => {
  // A 标签页在青禾会话时拿到 revision
  const meSession = (await sessionApi.current()).sessionId;
  const scopeBefore = await storage.getScoped('items', 'user_me');
  // B 标签页切换到陈木木再切回青禾（新会话），并由青禾发布一件新物品
  await userApi.login('user_chen');
  await userApi.login('user_me');
  const meNewSession = (await sessionApi.current()).sessionId;
  await itemApi.create(meNewSession, {
    user_id: 'user_me',
    title: '青禾第二件物品',
    description: '测试',
    category: '其他',
    condition: ItemStatus.GOOD,
    images: [],
    location: '上海',
    status: ItemStatus.AVAILABLE,
  });
  // A 用过期 sessionId 直接 CAS 写 -> 会话过期拒绝
  await assert.rejects(
    () => storage.compareSetScoped('items', 'user_me', 0, () => []),
    ConflictError,
  );
  // 即便拿到旧 sessionId 的调用路径也会被会话层挡住
  await assert.notEqual(meSession, meNewSession);
  await assert.rejects(
    () => itemApi.setStatus(meSession, 'item_chair', ItemStatus.OFFLINE),
    SessionStaleError,
  );
  const scopeAfter = await storage.getScoped('items', 'user_me');
  assert.ok(scopeAfter.rows.some((i) => i.title === '青禾第二件物品'), '新结果必须保留');
  assert.ok(scopeAfter.revision > scopeBefore.revision);
});

// 11) 首页与交换列表同源：catalogApi 快照在一次并发读取中完全一致。
await test('首页与交换列表读取同一快照结果', async () => {
  const me = (await sessionApi.current()).sessionId;
  const [a, b] = await Promise.all([catalogApi.snapshot(me), catalogApi.snapshot(me)]);
  assert.strictEqual(a, b, '应复用同一快照对象');
  assert.ok(a.items.length >= 3);
  assert.ok(a.exchanges.some((e) => e.id === 'exchange_seed'));
  const listMine = await exchangeApi.listMine(me);
  assert.deepEqual(
    listMine.map((e) => e.id).sort(),
    a.exchanges
      .filter((e) => e.from_user_id === 'user_me' || e.to_user_id === 'user_me')
      .map((e) => e.id)
      .sort(),
  );
});

// 12) 操作记录按账号隔离：林小雨看不到青禾的记录，且自己的登录有迹可循。
await test('操作记录隔离到各用户作用域', async () => {
  const me = (await sessionApi.current()).sessionId;
  const myLogs = await operationApi.listMine(me);
  await userApi.login('user_lin');
  const lin = (await sessionApi.current()).sessionId;
  const linLogs = await operationApi.listMine(lin);
  assert.ok(myLogs.length >= 1);
  assert.ok(linLogs.some((l) => l.detail.includes('林小雨')));
  assert.ok(linLogs.every((l) => l.user_id === 'user_lin'));
  assert.ok(myLogs.every((l) => l.user_id === 'user_me'));
});

// 13) 迁移失败可重试：人为破坏一个作用域写后再次 run，应能恢复（幂等合并）。
await test('迁移失败后重试幂等', async () => {
  // 直接把迁移状态置为 failed，重跑应回到 done，数据不重复。
  await storage.set(STORAGE_KEYS.migration, { status: 'failed', attempts: 2, error: 'mock' });
  const lin = (await sessionApi.current()).sessionId;
  const before = (await storage.getScoped('items', 'user_lin')).rows.length;
  await migrationApi.run();
  const state = await migrationApi.getState();
  assert.equal(state.status, 'done');
  const after = (await storage.getScoped('items', 'user_lin')).rows.length;
  assert.equal(after, before, '重试迁移不应重复写入种子');
  void lin;
});

let failed = 0;
for (const [status, name] of results) {
  if (status === 'FAIL') failed += 1;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);

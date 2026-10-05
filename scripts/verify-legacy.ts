// 验证旧版全局数据（reswap:items / reswap:exchanges / current-user-id）按归属迁移。
class LocalStorageShim {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
globalThis.localStorage = new LocalStorageShim();
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const assert = (await import('node:assert')).default;
const { migrationApi } = await import('../src/api/migrationApi.ts');
const { itemApi } = await import('../src/api/itemApi.ts');
const { exchangeApi } = await import('../src/api/exchangeApi.ts');
const { sessionApi } = await import('../src/api/sessionApi.ts');
const { userApi } = await import('../src/api/userApi.ts');
const { storage, STORAGE_KEYS } = await import('../src/utils/storage.ts');

// 模拟旧版本：一个全局 items、一个全局 exchanges，归属混在数组里。
const oldItems = [
  {
    id: 'legacy_1', user_id: 'user_me', title: '旧青禾物品', description: '', category: '数码',
    condition: 'good', images: [], status: 'available', location: '上海',
    created_at: new Date().toISOString(),
  },
  {
    id: 'legacy_2', user_id: 'user_lin', title: '旧林小雨物品', description: '', category: '家居',
    condition: 'like_new', images: [], status: 'available', location: '杭州',
    created_at: new Date().toISOString(),
  },
];
const oldExchanges = [
  {
    id: 'legacy_ex_1', from_user_id: 'user_lin', to_user_id: 'user_me',
    from_item_id: 'legacy_2', to_item_id: 'legacy_1', status: 'pending', message: '旧交换',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
];
await storage.set(STORAGE_KEYS.legacyItems, oldItems);
await storage.set(STORAGE_KEYS.legacyExchanges, oldExchanges);
await storage.set(STORAGE_KEYS.legacyCurrentUserId, 'user_lin');
// 用户表（旧版本也有）
await userApi.list();

const state = await migrationApi.run();
assert.equal(state.status, 'done');

// 初始会话沿用旧 current-user-id = user_lin，但用的是全新 sessionId
const session = await sessionApi.current();
assert.equal(session.userId, 'user_lin');
assert.ok(session.sessionId.startsWith('sess_'));

// 林小雨作用域：她的物品 + seed 相机/夜灯
const linItems = await itemApi.listMine(session.sessionId);
assert.deepEqual(linItems.map((i) => i.id).sort(), ['legacy_2']);
assert.ok(!linItems.some((i) => i.id === 'legacy_1'), '青禾的旧物品不能进入林小雨作用域');

// 林小雨视角的交换：seed(me->lin) 与 legacy(lin->me) 都在
const linExchanges = await exchangeApi.listMine(session.sessionId);
const ids = linExchanges.map((e) => e.id);
assert.deepEqual(ids, ['legacy_ex_1']);

// 切到青禾：也应看到 legacy_ex_1（她是收到方）
await userApi.login('user_me');
const meSession = (await sessionApi.current()).sessionId;
const meItems = await itemApi.listMine(meSession);
assert.deepEqual(meItems.map((i) => i.id).sort(), ['legacy_1']);
const meExchanges = await exchangeApi.listMine(meSession);
assert.ok(meExchanges.some((e) => e.id === 'legacy_ex_1'));

// 旧 key 已清理
assert.equal(globalThis.localStorage.getItem(STORAGE_KEYS.legacyItems), null);
assert.equal(globalThis.localStorage.getItem(STORAGE_KEYS.legacyCurrentUserId), null);

// 首页快照同时聚合双方物品
const { catalogApi } = await import('../src/api/catalogApi.ts');
const snap = await catalogApi.snapshot(meSession, true);
assert.ok(snap.items.some((i) => i.id === 'legacy_1'));
assert.ok(snap.items.some((i) => i.id === 'legacy_2'));

console.log('PASS  旧版全局数据按归属拆分迁移，双方作用域正确，旧 key 已清理');

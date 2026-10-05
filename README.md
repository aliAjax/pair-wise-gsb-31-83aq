# ReSwap 二手闲置物品交换平台

```bash
pnpm install
pnpm dev
```

访问地址：`http://localhost:18415`

## 项目介绍

ReSwap 是一个纯前端以物换物 Web 应用。用户可以本地模拟登录、发布闲置物品、浏览他人物品、发起交换请求，并在浏览器内管理交换记录。

## 主要功能

- 首页瀑布流浏览、分类筛选、关键词搜索。
- 物品详情、物主资料、选择自己的物品发起交换。
- 发布物品，支持本地 base64 图片上传、分类和成色选择。
- 交换管理，区分我发起的和我收到的请求，支持同意、拒绝、完成。
- 个人中心，编辑资料、上传头像、查看我发布的物品。
- 主题切换、全局错误处理和 Vant 提示。

## 启动与构建

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

生产部署：执行 `pnpm build` 后，将 `dist/` 目录交给 Nginx 或任意静态文件服务器托管。

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| UI | Vant + Tailwind CSS |
| 持久化 | localStorage + IndexedDB（idb-keyval） |
| 工具库 | dayjs、lodash-es |

## 项目目录结构

```text
src/
├── api/              # userApi/sessionApi/itemApi/exchangeApi/operationApi/catalogApi/migrationApi
├── stores/           # authStore, itemStore, exchangeStore, themeStore, migrationStore
├── models/           # user.ts, item.ts, exchange.ts, operationLog.ts：独立数据模型
├── types/            # 共享类型补充（ScopedCollection / SessionInfo / CatalogSnapshot 等）
├── components/common/# 共享业务组件、GlobalErrorBoundary、MigrationBanner
├── hooks/            # useAuth.ts, useLocalStorage.ts, useExchangeStats.ts, useOperationLogs.ts
├── pages/            # Home, ItemDetail, Publish, Exchanges, Profile
├── router/           # index.ts + guards.ts
├── utils/            # storage.ts（作用域 key + CAS）, errors.ts, formatters.ts, validators.ts, message.ts, themeUtils.ts
├── constants/        # item.ts, exchange.ts, themes.ts, messages.ts, seed.ts
├── App.vue
├── main.ts
└── styles.css
```

## 数据持久化说明

- `utils/storage.ts` 统一封装 localStorage 和 IndexedDB。
- 所有 `api/*Api.ts` 通过 `storage.ts` 读写数据，不在组件里直接写业务数据。
- 存储层包含序列化、版本号、过期清理、存储 key 管理。
- 首次启动会写入演示用户、物品和交换请求。

### 用户作用域与会话隔离

- 私人物品、交换请求、操作记录全部按用户作用域存储，key 形如
  `reswap:scope:items:{userId}`、`reswap:scope:exchanges:{userId}`、`reswap:scope:operations:{userId}`，
  每个作用域带 `revision`，写入采用 compare-and-set：revision 与最新值不一致即拒绝，
  旧标签页基于旧结果的提交不会覆盖新结果。
- 当前会话保存在 `reswap:current-session`（`userId + sessionId + startedAt`）。
  每次登录/切换账号都会生成全新 `sessionId`；所有读写都经 `api/sessionApi.ts`
  先校验会话，会话过期抛 `SessionStaleError`，归属不符抛 `PermissionDeniedError`，
  revision 冲突抛 `ConflictError`，越权请求直接拒绝。
- 交换请求在发起方与收到方两个作用域各存一份：同意/拒绝仅收到方可操作，完成仅发起方可操作。
- `api/catalogApi.ts` 是首页与交换列表的唯一读取来源，同一次水合复用同一快照 Promise，
  写操作后统一失效并重建，保证「迁移后首页与交换列表读取同一结果」。
- 跨标签页通过 `storage` 事件订阅会话变更：其他标签页登录/切换账号后，本页自动
  切到最新账号作用域并提示，旧会话上的后续写入被拒绝。
- 旧的全局数据（`reswap:items`、`reswap:exchanges`）由 `api/migrationApi.ts`
  按 `user_id` / 双方归属拆分迁移到各用户作用域，迁移状态记录在
  `reswap:migration-v2`，按 id 幂等合并（较新 `updated_at` 优先），失败后首页横幅可点击重试，
  迁移成功后删除旧 key。全新安装则把演示数据种入各自作用域。

### 行为验证脚本

```bash
npm run verify         # 会话隔离 / 越权拒绝 / CAS 冲突 / 同源快照 / 操作记录隔离
npm run verify:legacy  # 旧版全局数据按归属迁移、双方作用域正确、旧 key 清理
```

## 横切关注点

- 主题切换：`stores/themeStore.ts`、`constants/themes.ts`、`utils/themeUtils.ts`、`App.vue`、`components/common/CategoryFilter.vue`、`components/common/UserBrief.vue`、`components/common/ItemCard.vue`。
- 全局错误处理/提示：`utils/message.ts`、`components/common/GlobalErrorBoundary.tsx`、`stores/authStore.ts`、`stores/itemStore.ts`、`stores/exchangeStore.ts`、`components/common/ImageUploader.vue`。

## 枚举出现位置清单

### ItemStatus

定义位置：`src/constants/item.ts`

出现位置：

- `src/models/item.ts`
- `src/constants/messages.ts`
- `src/api/itemApi.ts`
- `src/api/exchangeApi.ts`
- `src/stores/itemStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/components/common/ItemCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Publish.vue`
- `src/pages/Profile.vue`

### ExchangeStatus

定义位置：`src/constants/exchange.ts`

出现位置：

- `src/models/exchange.ts`
- `src/constants/messages.ts`
- `src/api/exchangeApi.ts`
- `src/stores/exchangeStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/hooks/useExchangeStats.ts`
- `src/components/common/ExchangeCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Exchanges.vue`

## 分层与高耦合约束

本项目保留提示词要求的“严禁合并职责到单一文件”：模型、常量、API、store、页面、组件、hooks、utils 均独立拆分。

同时保留“屎山代码设计要求”的低内聚高耦合特征：

- `utils/formatters.ts` 同时负责日期、物品状态、交换状态、成色、信用等级文本。
- `constants/messages.ts` 同时包含页面提示、表单校验、日志式文案和状态文案。
- `ItemStatus` 与 `ExchangeStatus` 被模型、API、store、组件、页面、router guards、formatters 多处引用。
- `utils/storage.ts` 是存储入口，但全应用 API 和 store 都依赖它的 key 与数据结构。

例如新增 `ItemStatus.BOOKED` 时，应至少修改：`src/constants/item.ts`、`src/models/item.ts`、`src/api/itemApi.ts`、`src/api/exchangeApi.ts`、`src/stores/itemStore.ts`、`src/router/guards.ts`、`src/utils/formatters.ts`、`src/constants/messages.ts`、`src/components/common/ItemCard.vue`、`src/pages/ItemDetail.vue`、`src/pages/Publish.vue` 等文件。

## 环境变量

当前项目无必需环境变量。

## License

MIT

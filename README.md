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
├── api/              # userApi.ts, itemApi.ts, exchangeApi.ts：本地数据 API 层
├── stores/           # authStore.ts, itemStore.ts, exchangeStore.ts, themeStore.ts
├── models/           # user.ts, item.ts, exchange.ts, operationLog.ts：独立数据模型
├── types/            # 共享类型补充（SessionState / MigrationState / ScopeKind）
├── components/common/# 共享业务组件和 GlobalErrorBoundary
├── hooks/            # useAuth.ts, useSessionSync.ts, useLocalStorage.ts, useExchangeStats.ts
├── pages/            # Home, ItemDetail, Publish, Exchanges, Profile
├── router/           # index.ts + guards.ts
├── utils/            # storage.ts, session.ts, errors.ts, formatters.ts, validators.ts, message.ts, themeUtils.ts
├── constants/        # item.ts, exchange.ts, themes.ts, messages.ts
├── App.vue
├── main.ts
└── styles.css
```

> 会话隔离相关：`utils/session.ts`（nonce 校验）、`utils/errors.ts`（`SessionError`/`PermissionError`）、`api/migrationApi.ts`（旧数据迁移与重试）、`stores/migrationStore.ts`、`stores/operationStore.ts`。

## 数据持久化说明

- `utils/storage.ts` 统一封装 localStorage 和 IndexedDB，并提供按 key 串行的 `update`（读-改-写）与作用域键 `scope:{kind}`。
- 所有 `api/*Api.ts` 通过 `storage.ts` 读写数据，不在组件里直接写业务数据。
- 存储层包含序列化、版本号（当前 v2）、过期清理、存储 key 管理。
- **按用户作用域隔离**：私人物品 `reswap:scope:{userId}:items`、交换请求 `reswap:scope:{userId}:exchanges`、操作记录 `reswap:scope:{userId}:logs`。交换请求在双方作用域各存一份；首页/交换列表读取同一套聚合结果。
- **会话校验**：会话为 `{ userId, nonce, loggedInAt }`（`reswap:session`）。每次登录刷新 `nonce`，所有写操作都经 `utils/session.ts` 的 `assert` 校验最新会话与归属，越权请求与旧标签页（旧 nonce）写回直接抛出 `SessionError` / `PermissionError`。
- **提交不被旧结果覆盖**：物品与交换请求带单调递增的 `revision`；提交时携带页面看到的版本号，存储中已更新则拒绝；聚合时同一 id 取 `revision` 更大的结果。
- **跨标签页**：监听 `storage` 事件，其他标签页切换账号后本页立即同步最新会话并重载数据。
- **v1 → v2 迁移**：`api/migrationApi.ts` 把旧的全局 `items` / `exchanges` 按归属迁入各用户作用域，旧 `current-user-id` 升级为带 nonce 的会话；迁移失败会显示提示条，可一键重试（重入且按 revision 合并不重复）。
- 首次启动（迁移后若无作用域数据）会写入演示用户、物品和交换请求。

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

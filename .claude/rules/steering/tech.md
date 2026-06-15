# Technology Stack

## Architecture

Electron 多进程架构，但核心约束在于**双 preload + 三层 API**：

- **主进程** (`src/main/`) 承载所有系统能力、插件生命周期、原生模块绑定。
- **渲染进程** (`src/renderer/`) 为主窗口 Vue 应用（搜索界面、超级面板 UI 等）。
- **插件进程**运行在独立的 WebContentsView 中，通过专用 preload (`resources/preload.js`) 注入 `window.ztools`。

关键设计原则：能力**不直接暴露给渲染层**，而是经 IPC / API 分发器收敛到主进程统一处理。

## Core Technologies

- **Language**: TypeScript 5.9（主进程与渲染进程均强类型；本项目 `any` 被允许，`@typescript-eslint/no-explicit-any: off`）
- **Framework**: Electron 41 + Vue 3.5 + Pinia 3
- **Runtime**: Node 24.15 / Chrome 146
- **Build**: Vite 7 + electron-vite 4 + electron-builder 26

## Key Libraries

仅列出**影响开发模式**的核心依赖（非完整列表）：

- `lmdb` — 嵌入式 KV 存储，全项目唯一数据持久化后端
- `fuse.js` + `pinyin-pro` — 搜索引擎与拼音匹配
- `uiohook-napi` — 全局键鼠钩子（超级面板 / 悬浮球 / 双击修饰键触发）
- `webdav` — 跨设备同步引擎
- `openai` — AI 集成（OpenAI 兼容协议，流式）

## Development Standards

### Type Safety

- TypeScript `composite` 项目引用：`tsconfig.node.json`（main / preload / shared）与 `tsconfig.web.json`（renderer）分离，类型检查 MUST 分进程独立运行（`pnpm typecheck:node` / `typecheck:web`）。
- 允许 `any`，但约定仅在跨 IPC / 原生模块边界处使用，业务逻辑 SHOULD 具体类型。
- 未使用变量 / 参数 MUST 加 `_` 前缀忽略（`argsIgnorePattern: '^_'`）。

### Code Quality

- Prettier 约定：`singleQuote`、`semi: false`、`printWidth: 100`、`trailingComma: none`、`endOfLine: lf`。
- ESLint 9 flat config：基于 `@electron-toolkit` 的 ts recommended + vue recommended。
- Vue 单文件组件 MUST 使用 `<script lang="ts">`（`vue/block-lang: error`）。
- UI 样式 SHOULD 复用 `src/renderer/src/style.css` 的通用控件类（`.btn .input .select .toggle .card`），不在组件内重复定义。

### Testing

- Vitest 4，`environment: node`、`globals: true`，测试位于 `tests/**/*.test.ts`。
- 纯逻辑（如指令匹配 `commandMatchers.ts`）SHOULD 设计为无副作用纯函数，便于单测。

## Development Environment

### Required Tools

- Node.js >= 18（README 门槛），实际目标 Node 24。
- pnpm（通过 `onlyBuiltDependencies` 管理原生依赖构建）。
- 平台原生工具链：C++ Node-API，macOS / Windows 各一份 `.node`（`resources/lib/{mac,win}/`）。

### Common Commands

```bash
pnpm dev              # 主进程 + setting 内置插件并行热重载
pnpm typecheck        # typecheck:node && typecheck:web
pnpm build            # typecheck + build:setting + electron-vite build
pnpm test             # vitest run
pnpm format           # prettier --write .
```

## Key Technical Decisions

- **双 preload 架构**：主程序用 `src/preload/index.ts`（经 Vite 构建、`contextBridge` 暴露、热重载）；插件用 `resources/preload.js`（**不经 Vite**、原生 JS、`session.registerPreloadScript` 注入、**改后需重启应用**）。这是最易踩坑的边界。
- **插件 API 统一分发器**：新插件 API SHOULD 通过 `registerPluginApiServices` 注册，插件端用 `ipcSendSync` / `ipcInvoke` / `ipcSend` 三方法调用；旧的直接 `ipcMain.handle` 方式仍兼容但非首选。
- **数据隔离**：LMDB 通过命名空间前缀（`ZTOOLS/`、`PLUGIN/{name}/`、`SYNC/`）隔离主程序与各插件，删除插件时自动清理其历史与固定列表。
- **万物皆指令**：所有可搜索内容统一为 `Command` 类型（`direct` / `plugin` / `builtin`），搜索引擎对内聚一致。
- **WebContentsView 而非 BrowserView**：每个插件装配由 `pluginAssemblyCoordinator` 状态机管理（`idle → assembling → domReady → readyToDisplay → displayed`）。

---

_Document standards and patterns, not every dependency_

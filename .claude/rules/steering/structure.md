# Project Structure

## Organization Philosophy

按**进程 + 关注点**组织，而非按技术分层：

- **按进程分顶层**：`src/main` / `src/preload` / `src/renderer` / `src/shared`。
- **主进程内部按职责域切分**：`managers/`（资源生命周期管理器）、`core/`（领域引擎）、`api/`（IPC 暴露层）、`utils/`（纯工具）。
- **渲染进程按特性域组织**：`stores/`（Pinia）、`composables/`、`components/`。

## Directory Patterns

### 主进程 API 三层 (`src/main/api/`)

**Location**: `api/shared/`、`api/renderer/`、`api/plugin/`
**Purpose**: 按**消费者**分层暴露能力。`shared` 主程序与插件共用；`renderer` 仅主窗口可用；`plugin` 面向第三方 + 内置插件。
**Example**: `database.ts` 在 `shared/`（双方共用）；`commands.ts` / `plugins.ts` 在 `renderer/`（主窗口）；`ai.ts` / `zbrowser.ts` 在 `plugin/`（插件）。

### Manager 模式 (`managers/`)

**Location**: `managers/*.ts`
**Purpose**: 管理一类系统资源的完整生命周期（窗口、插件视图、剪贴板等），单例、长生命周期。
**Example**: `pluginManager.ts`（插件 WebContentsView 生命周期）、`windowManager.ts`（窗口 + 全局快捷键）、`clipboardManager.ts`。

### 领域引擎 (`core/`)

**Location**: `core/<domain>/`
**Purpose**: 自洽的子系统，含状态机 / 客户端 / 原生绑定，与 IPC 层解耦。
**Example**: `core/lmdb/`、`core/sync/`、`core/zbrowser/`、`core/commandScanner/`、`core/native/`（C++ 原生模块）。

### 独立内置插件 (`internal-plugins/`)

**Location**: `internal-plugins/{setting,system}/`
**Purpose**: 作为插件运行但享有更高权限（`window.ztools.internal` 命名空间）。`setting` 是**独立 Vite + UnoCSS Vue 项目**，有自己的 `vite.config.ts`，与主程序解耦构建。

### 对外类型子模块 (`ztools-api-types/`)

**Purpose**: 对外发布的插件 API 类型，git submodule，MUST 用 `pnpm sync-api-types` 同步类型，不在主仓直接改。

## Naming Conventions

- **进程 / 工具 / manager 文件**：camelCase（`windowManager.ts`、`pluginApiDispatcher.ts`）。
- **Vue 组件文件**：PascalCase（`SearchBox.vue`、`DetailPanel.vue`）。
- **类**：PascalCase；**函数 / 变量**：camelCase。
- **IPC 通道**：内置插件 API 用 `internal:` 前缀；普通插件 API 走分发器名；旧直连用领域前缀（如 `plugin:my-feature`）。
- **数据库命名空间**：`ZTOOLS/`（主程序）、`PLUGIN/{name}/`（插件，自动隔离）、`SYNC/`（同步配置）。

## Import Organization

```typescript
import { registerPluginApiServices } from './pluginApiDispatcher' // 相对（同模块内）
import { storeToRefs } from 'pinia' // 第三方
import Something from '@renderer/components/Something.vue' // 绝对别名（渲染进程）
import { dbGet } from '@shared/database' // 跨进程共享
```

**Path Aliases**：

- `@renderer/*` → `src/renderer/src/*`（仅 `tsconfig.web.json` / 渲染进程可用）
- `@shared/*` → `src/shared/*`（主进程与渲染进程均可用）

## Code Organization Principles

- 新增 IPC 能力 MUST 先确定消费者（主窗口 vs 插件 vs 内置插件），再落到对应 `api/` 子层。
- 新增插件 API SHOULD 走 `registerPluginApiServices` 分发器，而非直接 `ipcMain.handle`。
- 单例模块统一导出实例：`export default new XxxAPI()`，并在 `api/index.ts` 的 `APIManager.init()` 中调用 `init()`。
- 纯逻辑（匹配、计算、哈希）SHOULD 抽成无副作用函数，便于 Vitest 单测（参照 `commandMatchers.ts`）。
- `resources/preload.js`（插件 preload）**不热重载**，修改后 MUST 重启应用；`src/preload/index.ts`（主程序 preload）会热重载。
- `src/preload/index.ts` 底部的类型声明 MUST 与 `src/renderer/src/env.d.ts` 保持同步。

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_

# Product Overview

ZTools 是一个跨平台 (macOS/Windows) 高性能应用启动器与插件平台，定位为 uTools 的开源实现。它通过全局快捷键唤起主搜索界面，将"启动应用、执行系统操作、运行插件"统一为一套搜索交互（`Option+Z` / `Alt+Z` 唤起）。

面向两类用户：

- **终端用户**：追求键盘驱动的快速启动、剪贴板管理、超级面板等日常提效能力。
- **插件开发者**：基于 `plugin.json` + 全局 `window.ztools` 对象，零成本扩展平台能力，一次开发跨平台运行。

## Core Capabilities

- 拼音 / 正则 / 全局钩子搜索，基于"万物皆指令"模型（统一 `Command` 类型）。
- 插件系统：UI 插件（WebContentsView 承载界面）与无界面插件（headless），含自动数据隔离。
- 剪贴板历史管理（跨平台原生 C++ 实现）。
- 多种触发与承载形态：超级面板（中键 / 长按右键）、悬浮球、分离窗口、网页快开。
- 平台级扩展能力：WebDAV 同步、MCP Server、AI 集成、ZBrowser 浏览器自动化、离线翻译（Bergamot WASM）。

## Target Use Cases

- 全局快速启动应用、本地启动项与 Windows 系统设置（ms-settings）。
- 通过插件承载任意工作流：数据处理、自动化、AI 对话、浏览器自动化。
- 跨设备同步数据与已安装插件。

## Value Proposition

- **开源 (MIT) + 跨平台**，macOS / Windows 统一交互体验。
- **插件 API 与 uTools 形态兼容**，降低迁移与生态复用成本。
- **LMDB + WebContentsView 架构**保证极速响应；插件数据按命名空间隔离，安全可靠。

---

_Focus on patterns and purpose, not exhaustive feature lists_

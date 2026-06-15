## 1. 路径模型

- [x] 1.1 在 `src/main/utils/systemPaths.ts` 新增 `getWindowsRootScanPaths(): string[]`,返回用户级(`%USERPROFILE%\...\Start Menu`)与系统级(`C:\ProgramData\...\Start Menu`)的 **Start Menu 根**路径(不含 `Programs`)。不改动 `getWindowsScanPaths()`。

## 2. 扫描器:扁平根扫描

- [x] 2.1 将 `scanDirectory` 中"逐文件处理"段(`.lnk` / `.url` 解析、本地化名查找、`_dedupeTarget`、`SKIP_NAME_PATTERN` 过滤、`apps.push`)抽成共享内部函数,供递归与扁平两个入口复用。
- [x] 2.2 新增并**导出** `scanDirectoryFlat(dirPath, apps, displayNameMap)`:复用 2.1 的共享处理,只处理本层 entries,**不下钻**子目录(导出便于单测,与 `shouldSkipShortcut` 等风格一致)。
- [x] 2.3 在 `scanApplications` 中:对 `getWindowsScanPaths()` 各路径走 `scanDirectory`(递归,行为不变);对 `getWindowsRootScanPaths()` 各路径走 `scanDirectoryFlat`;结果统一交给 `deduplicateCommands` 去重。
- [x] 2.4 确认不变式:`scanDirectoryFlat` 对 Start Menu 根不下钻 `Programs`,与递归 `Programs` 扫描无重叠。

## 3. 监听器:扁平根 watcher

- [x] 3.1 在 `src/main/appWatcher.ts` 新增扁平根 watcher:对 `getWindowsRootScanPaths()` 以 `depth: 0` 启动 chokidar,监听 `.lnk` 的 `add` / `unlink`,复用现有防抖 `notifyChange`。
- [x] 3.2 将 `AppWatcher` 改为管理两个 watcher(递归 watcher 不变 + 扁平根 watcher):`startWatching` / `stop` / `restart` 同时操作两者;对外 `init` / `stop` / `restart` 接口语义不变。
- [x] 3.3 确认 `shouldIgnore` 对扁平根 watcher 正确(仅放行 `.lnk`;`depth: 0` 下无子目录递归问题)。

## 4. 测试(自动化,替代手动验证;均 mock 依赖、跨平台运行,无需平台门控)

- [x] 4.1 为 `getWindowsRootScanPaths()` 新增单元测试(纯函数):断言返回用户级与系统级 Start Menu 根,且路径均不以 `Programs` 结尾。
- [x] 4.2 为 `scanDirectoryFlat` 新增单元测试(mock `fs/promises`):① 收集根级 `.lnk` 为 Command(name / path / icon 正确);② **不下钻子目录**(子目录内 `.lnk` 不被收集——本变更核心不变式);③ 应用 `shouldSkipShortcut` 过滤(如根级 `Uninstall.lnk` 被跳过);④ 正确填充 `_dedupeTarget`。
- [x] 4.3 扩展 `deduplicateCommands` 测试:新增"Start Menu 根级与 Programs 子树同名同目标合并"场景(若现有用例已覆盖,确认即可)。
- [x] 4.4 `scanApplications` 集成单测(mock `fs/promises`):构造 Windows Start Menu 文件系统(根级 `.lnk` + Programs 子树 `.lnk` + 根级子目录内 `.lnk`),断言根级与 Programs 的 `.lnk` 均被索引、根级子目录内的不被索引 —— 替代"手动放置 `.lnk` 看是否可搜"。mock 的 `desktop.ini` **不含 MUI `@` 引用**(避免触发仅 win32 可用的原生 `MuiResolver`);断言以磁盘文件名 / 路径为准。
- [x] 4.5 `appWatcher` 双 watcher 接线单测(mock `chokidar` + `vi.mock('electron')` 提供桩):断言启动了两个 watcher —— 递归(`depth: 5`,覆盖 `getWindowsScanPaths`)+ 扁平(`depth: 0`,覆盖 `getWindowsRootScanPaths`);模拟 `.lnk` 的 `add` / `unlink` 事件,断言路由到防抖 `notifyChange` —— 替代"手动增删看是否自动刷新"。注:真实 FS 事件投递属 chokidar 契约,不在单测范围。

## 5. 验证

- [x] 5.1 `pnpm typecheck`(node + web)通过。
- [x] 5.2 `pnpm test` 通过(§4 全部测试跨平台运行,无需 Windows)。—— §4 全部新增/扩展测试通过(systemPaths / windowsScannerFlat / appWatcher / windowsScanner)。另存 4 个与本变更**无关**的既有平台失败(`common` / `databasePluginIsolation` / `pluginDevelopmentRegistry`:Windows 路径分隔符硬编码 + `native/index` 的 `.node?asset` 在纯 vitest 下无法解析),经 `git stash` baseline 验证为改动前既有,不在本次范围。

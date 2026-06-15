## Context

Windows 指令扫描由 `src/main/core/commandScanner/windowsScanner.ts` 的 `scanApplications()` 驱动:它从 `getWindowsScanPaths()` 取得一组根路径,逐个递归扫描其中的 `.lnk` / `.url`。该路径函数同时被 `src/main/appWatcher.ts` 复用,作为 chokidar 的监听根。

当前 `getWindowsScanPaths()` 把开始菜单两条路径写死到 `...\Start Menu\Programs`(见 `systemPaths.ts:10-28`),即**子文件夹**而非 `Start Menu` 根。递归扫描从子文件夹起,故 `Start Menu\` 根目录下直接放置的快捷方式永远不被索引(且监听器同理漏掉根级变更)。这就是 issue #551。

本变更的核心约束:两个消费者(扫描器、监听器)对"Start Menu 根是扁平、Programs 子树是递归"这一区分必须语义一致。本地化名解析不在此约束内(见 Decision 2 说明)。

## Goals / Non-Goals

**Goals:**

- 让用户级与系统级 `Start Menu` **根目录**下的 `.lnk` / `.url` 被索引为可搜索指令。
- 让监听器能检测根级快捷方式的增删并刷新列表,且监听范围与扫描范围精确对齐。
- 不改动 `Programs` 子树与 Desktop 的现有扫描 / 监听行为。

**Non-Goals:**

- 不修复系统级路径硬编码盘符 `C:` 的健壮性问题(范围外,见 proposal Impact)。
- 不扫描 `Start Menu` 根级**子目录**内的快捷方式(扁平设计,仅根级直接文件)。
- 不扩展本地化名解析(根 desktop.ini 无 `[LocalizedFileNames]`,见 Decision 2)。
- 不改变 `.lnk` / `.url` 的解析、图标、去重、过滤等逐文件处理逻辑。

## Decisions

### Decision 1:路径模型 —— 新增独立方法 `getWindowsRootScanPaths()`,不改 `getWindowsScanPaths()`

`getWindowsScanPaths(): string[]` 的返回类型与语义保持不变,其两个现有调用方(扫描器递归、监听器递归)零改动。另新增 `getWindowsRootScanPaths(): string[]` 返回用户级与系统级 `Start Menu` 根路径(不含 `Programs`)。

纯增量的"保留 + 新增"风格,爆破半径最小。

**Alternatives:**

- **结构化返回 `{ path, recursive }[]`**:更内聚,但改变返回类型,两个调用方都要改解包逻辑,且把"递归与否"的语义渗入路径模型,引入更多耦合。否决。
- **替换式(把 `Programs` 路径换成 `Start Menu` 根,仍递归)**:1 行改动,但 (i) 改变已验证的 Programs/Desktop 扫描行为(递归根上移,`getLocalizedDisplayNames` 递归范围也变);(ii) 监听器 `depth:5` 基准点上移,Programs 有效深度从 5 降为 4;(iii) 扰动面大。否决。

### Decision 2:扫描器 —— 抽取共享逐文件处理 + 新增 `scanDirectoryFlat`

扁平根扫与递归扫共享**全部**逐文件逻辑(`.lnk` / `.url` 解析、本地化名查找、`_dedupeTarget`、`SKIP_NAME_PATTERN` 过滤、push),唯一区别是"是否下钻子目录"。把 `scanDirectory` 中的逐文件处理段抽成共享内部函数,递归与扁平两个入口都调用它:

- `scanDirectory`(递归,现有):处理本层 entries + 对子目录递归。
- `scanDirectoryFlat`(新增):**只**处理本层 entries,不下钻。

关键不变式:`scanDirectoryFlat` 对 Start Menu 根 MUST NOT 下钻 `Programs`,否则与递归 `Programs` 扫描重复。`deduplicateCommands` 的现有 `name|target` 去重天然覆盖根级与 Programs 级的同名同目标合并。

**Alternative:** 给 `scanDirectory` 加 `recursive` 形参。功能等价,但扁平与递归混在单一函数内可读性差,扁平意图不显眼。独立函数更清晰。

**关于本地化名解析(不做):** 经实证,`Start Menu\desktop.ini`(用户级 / 系统级)仅含 `[.ShellClassInfo]`(文件夹自身名),**无 `[LocalizedFileNames]` 条目**;需本地化名的系统快捷方式均在 `Programs` 子树(已由现有递归覆盖)。故本变更**不扩展** `getLocalizedDisplayNames`,根级 `.lnk` 经现有 `displayNameMap.get(fullPath) || 磁盘文件名` 降级,零功能损失。

### Decision 3:监听器 —— 双 watcher(A 递归不变 + B 扁平根 `depth: 0`)

**核心原则:监听范围 MUST 等于扫描范围。** 扫描器对 Start Menu 根是扁平的,故监听器对根也必须扁平。

实现:在 `AppWatcher` 中新增第二个 chokidar 实例,以 `depth: 0` 扁平监听 `getWindowsRootScanPaths()`;现有递归 watcher(`getWindowsScanPaths()`,`depth: 5`)保持不变。两者共用现有防抖 `notifyChange`(`.lnk` add/unlink → 刷新)。

**为何不用单 watcher 把根加进去靠 chokidar 去重(否决):**

- 去重是**偶然的**——仅当 `Programs` 恰好同时是 watchPath 时才生效,耦合脆弱;一旦 `Programs` 从 `getWindowsScanPaths` 移除,根会悄悄递归监听整个 `Programs`,无报错。
- Start Menu 根下若存在 `Programs` **以外**的子目录,递归监听会监到扫描器根本不索引的位置 → 无意义刷新 + 监听范围宽于扫描范围。
- chokidar 的 `depth` 是**全局**选项,单次 `watch` 无法表达"根 `depth:0`、`Programs` `depth:5`",故用第二个 watcher 实现扁平根。

**Alternative:单 watcher + `ignored` 规则强制根扁平。** `ignored` 回调无法区分"经由哪个根到达此路径",无法干净表达"`Programs` 作为自身根递归、作为 Start Menu 根子目录不递归",逻辑易错。否决。

### Decision 4:范围限定 —— 仅 Start Menu 根,Desktop 不动

Desktop 两条路径已指向**真实根**(`app.getPath('desktop')` / `C:\Users\Public\Desktop`),`scanDirectory` 一进入即处理 `Desktop\*.lnk`,根级快捷方式早已覆盖,不存在 issue #551 的"指向子文件夹漏根"错位。无需新增任何 Desktop 处理。

## Risks / Trade-offs

- **[风险] Start Menu 根扁平扫遗漏根级子目录内的快捷方式** → 缓解:这是设计意图(扁平,仅根级直接文件),与 issue #551 需求一致。Windows 开始菜单根级惯例只放直接 `.lnk`;根级子目录内的快捷方式不在本次范围。
- **[风险] 双 watcher 增加 `AppWatcher` 复杂度** → 缓解:抽成 watcher 列表或两个具名实例,共用 `notifyChange`;改动集中在 `AppWatcher` 内部,不改变对外的 `init` / `stop` / `restart` 接口语义。
- **[风险] 系统级路径硬编码盘符 `C:`(范围外)** → 缓解:记录为已知缺口,本次不修,留待后续用 `%ProgramData%` / `%PUBLIC%` 处理;不影响用户级路径(已用 `os.homedir()`)。
- **[权衡] 较"替换式 Option A"代码量略大** → 换取 Programs / Desktop 已验证逻辑零扰动 + 监听范围与扫描范围精确对齐(单 watcher 方案做不到)。

## Migration Plan

不适用。本变更为内部、非破坏性改动:无 IPC / 插件 API 变更,无数据模型变更,无外部依赖变更。下次全量扫描即纳入根级快捷方式;监听器随应用重启后生效。回滚仅需还原 `systemPaths.ts` / `windowsScanner.ts` / `appWatcher.ts` 三处改动。

## Open Questions

- 是否在本次顺手修复系统级盘符硬编码(`%ProgramData%` / `%PUBLIC%`)?当前默认:**不修**(范围外)。待确认。

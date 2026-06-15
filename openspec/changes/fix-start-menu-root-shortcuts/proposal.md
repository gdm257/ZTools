## Why

ZTools 在 Windows 上扫描应用快捷方式时,`getWindowsScanPaths()` 把开始菜单路径硬编码到 `...\Start Menu\Programs` 子文件夹。由于扫描从该子文件夹向下递归,**直接放在 `Start Menu\` 根目录下的 `.lnk`(用户级与系统级均存在)永远不会被索引**,而这些快捷方式在 Windows 开始菜单中可见(GitHub issue #551)。同一个路径函数还被实时监听器 `appWatcher` 复用,因此根目录快捷方式的增删也不会触发列表刷新。

## What Changes

- 新增 `getWindowsRootScanPaths()`,返回用户级与系统级 `Start Menu` **根**路径(不含 `Programs`)。
- 指令扫描器(`windowsScanner`)新增对 Start Menu 根的**扁平(非递归)扫描**:抽取与递归扫描共享的逐文件处理逻辑,新增 `scanDirectoryFlat`,仅收集根级 `.lnk`/`.url`,避免与现有 `Programs` 子树扫描重复。
- 目录监听器(`appWatcher`)新增第二个 chokidar watcher,以 `depth: 0` 扁平监听 Start Menu 根;现有递归 watcher(Programs / Desktop)保持不变。
- Desktop 路径行为不变(其路径已指向真实根目录,根级 `.lnk` 早已被覆盖)。
- 本地化名解析(`getLocalizedDisplayNames`)不变:实证显示 `Start Menu` 根目录 desktop.ini 仅含 `[.ShellClassInfo]`(无 `[LocalizedFileNames]` 条目),根级 `.lnk` 直接用磁盘文件名即可。

无 IPC / 插件 API 变更,无外部依赖变更,向后兼容。

## Capabilities

### New Capabilities

- `windows-shortcut-scanning`: Windows 下从开始菜单(用户级 / 系统级,含 `Programs` 子树与 `Start Menu` 根级)与桌面扫描 `.lnk` / `.url` 快捷方式并索引为指令,以及对这些位置的目录变更监听。

### Modified Capabilities

<!-- openspec/specs/ 当前为空,本次为新建能力,无既有 spec 需修改。 -->

## Impact

- `src/main/utils/systemPaths.ts`:新增 `getWindowsRootScanPaths()`。
- `src/main/core/commandScanner/windowsScanner.ts`:重构扫描(抽取共享逐文件处理 + 新增 `scanDirectoryFlat` 扁平变体)。本地化名解析不变。
- `src/main/appWatcher.ts`:管理两个 watcher(现有递归 watcher 不变 + 新增扁平根 watcher,`depth: 0`),共用现有防抖 `notifyChange`。
- `tests/main/`:新增 `getWindowsRootScanPaths()` 单元测试;扩展扫描器测试覆盖根级 `.lnk` 的扁平扫描。
- **范围外(不在本次修复内)**:系统级路径硬编码盘符 `C:`(`C:\ProgramData\...`、`C:\Users\Public\Desktop`)的健壮性问题——若 Windows 装在非 C 盘,系统级开始菜单 / 公共桌面会丢失。已记录为相邻缺口,留待后续单独处理。

## ADDED Requirements

### Requirement: Windows 快捷方式扫描覆盖范围

系统 MUST 将以下位置的 `.lnk` / `.url` 快捷方式索引为可搜索指令,覆盖用户级与系统级两套开始菜单以及桌面:

- `Start Menu` **根目录**下直接放置的快捷方式(用户级 `%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\` 与系统级 `C:\ProgramData\Microsoft\Windows\Start Menu\`)。
- `Start Menu\Programs` 子树下(递归)的快捷方式。
- 桌面根目录下(用户桌面与公共桌面)的快捷方式。

其中 `Start Menu` 根目录的覆盖 MUST 仅限直接放置在该根下的文件,不递归进入其子目录。

#### Scenario: 用户级 Start Menu 根级 .lnk 可被搜索

- **WHEN** 用户在 `%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\` 根目录下放置一个指向已安装应用的 `App.lnk`
- **THEN** 该应用出现在 ZTools 的指令搜索结果中

#### Scenario: 系统级 Start Menu 根级 .lnk 可被搜索

- **WHEN** `C:\ProgramData\Microsoft\Windows\Start Menu\` 根目录下存在一个 `App.lnk`
- **THEN** 该应用出现在 ZTools 的指令搜索结果中

#### Scenario: Programs 子树深层快捷方式仍可被搜索

- **WHEN** `...\Start Menu\Programs\<子目录>\<深层>\Deep.lnk` 存在
- **THEN** 该快捷方式仍可被搜索(本次变更 MUST NOT 改变 Programs 子树递归扫描行为)

#### Scenario: Desktop 根级快捷方式仍可被搜索

- **WHEN** 用户桌面或公共桌面根目录下存在快捷方式
- **THEN** 该快捷方式仍可被搜索(本次变更 MUST NOT 改变 Desktop 扫描行为)

### Requirement: 跨位置同名同目标快捷方式去重

当 `Start Menu` 根级与 `Programs` 子树(或用户级与系统级之间)存在**同名且指向同一目标**的快捷方式时,系统 MUST 将其合并为单一指令。根级新增的快捷方式 MUST 复用与既有快捷方式完全一致的去重逻辑(`name|target` 组合键)。

#### Scenario: 根级与 Programs 同名同目标合并为单一指令

- **WHEN** `Start Menu\App.lnk` 与 `Start Menu\Programs\App.lnk` 名称相同且 `_dedupeTarget` 指向同一可执行文件
- **THEN** 搜索结果中该应用仅出现一次

### Requirement: Start Menu 根级快捷方式的实时监听

系统 MUST 检测 `Start Menu` 根级 `.lnk` 快捷方式的添加与删除,并触发指令列表刷新。针对 `Start Menu` 根的监听,其覆盖范围 MUST 与根级扫描的覆盖范围一致(仅根级直接文件,不递归子目录),且 MUST NOT 依赖与其他 watchPath 的去重来避免对 `Programs` 子树的重复监听。

#### Scenario: 新增 Start Menu 根级 .lnk 触发刷新并可搜索

- **WHEN** 在 `Start Menu` 根目录下新增一个 `NewApp.lnk`
- **THEN** 监听器检测到该新增并触发刷新
- **AND** 该应用随后可被搜索

#### Scenario: 删除 Start Menu 根级 .lnk 触发刷新并从结果移除

- **WHEN** 删除 `Start Menu` 根目录下的某个 `.lnk`
- **THEN** 监听器检测到该删除并触发刷新
- **AND** 该应用从搜索结果中移除

#### Scenario: Start Menu 根监听范围限定为根级

- **WHEN** `Start Menu` 根下存在 `Programs` 或其他子目录
- **THEN** 针对该根的监听 MUST NOT 因这些子目录而扩展监听深度(监听范围与扁平根扫描一致)

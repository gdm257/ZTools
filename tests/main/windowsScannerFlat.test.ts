import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// windowsScanner.ts import { shell } from 'electron'；systemPaths.ts import { app } from 'electron'。
// 一并 mock，避免依赖真实 Electron 运行时，确保跨平台运行。
vi.mock('electron', () => ({
  shell: { readShortcutLink: vi.fn() },
  app: { getPath: vi.fn((name: string) => `/mock/${name}`) }
}))

vi.mock('fs/promises', () => ({
  default: { readdir: vi.fn(), readFile: vi.fn() }
}))

// mock 原生模块，避免加载仅 win32 可用的 .node（MuiResolver 在本测试中不被触发）
vi.mock('../../src/main/core/native/index', () => ({
  MuiResolver: { resolve: vi.fn(() => new Map()) }
}))

import fsPromises from 'fs/promises'
import type { Dirent } from 'fs'
import os from 'os'
import path from 'path'
import { shell } from 'electron'
import {
  scanDirectoryFlat,
  scanApplications
} from '../../src/main/core/commandScanner/windowsScanner'
import { getWindowsScanPaths, getWindowsRootScanPaths } from '../../src/main/utils/systemPaths'

// 构造一个 Dirent 桩（readdir withFileTypes 返回 Dirent[]）
function dirent(name: string, isDir = false): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false
  } as unknown as Dirent
}

// stub platform -> 'linux'，使 getLocalizedDisplayNames 直接返回空 Map（第一行守卫），
// 从而根级 .lnk 一律降级为磁盘文件名（断言以磁盘文件名 / 路径为准），且不触发原生 MuiResolver。
let originalPlatform: string
beforeEach(() => {
  originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  vi.clearAllMocks()
})
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

// ========== 4.2 scanDirectoryFlat ==========

describe('scanDirectoryFlat（扁平根扫描）', () => {
  it('① 收集根级 .lnk 为 Command（name / path / icon 正确）', async () => {
    const dir = 'C:/StartMenuRoot'
    vi.mocked(fsPromises.readdir).mockResolvedValue([dirent('App1.lnk')])
    vi.mocked(shell.readShortcutLink).mockReturnValue({
      target: 'C:/Program Files/App1/app1.exe'
    } as never)

    const apps: unknown[] = []
    await scanDirectoryFlat(dir, apps as never, new Map())

    expect(apps).toHaveLength(1)
    const app = apps[0] as { name: string; path: string; icon: string }
    expect(app.name).toBe('App1')
    expect(app.path).toBe(path.join(dir, 'App1.lnk'))
    expect(app.icon).toContain('ztools-icon://')
  })

  it('② 不下钻子目录（子目录内 .lnk 不被收集——核心不变式）', async () => {
    const dir = 'C:/StartMenuRoot'
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      dirent('App1.lnk'),
      dirent('Programs', true),
      dirent('Extra', true)
    ])
    vi.mocked(shell.readShortcutLink).mockReturnValue({ target: 'C:/x.exe' } as never)

    const apps: unknown[] = []
    await scanDirectoryFlat(dir, apps as never, new Map())

    const names = (apps as Array<{ name: string }>).map((a) => a.name)
    expect(names).toEqual(['App1'])
    // readdir 仅被调用一次（根目录），未对 Programs / Extra 子目录下钻
    expect(fsPromises.readdir).toHaveBeenCalledTimes(1)
  })

  it('③ 应用 shouldSkipShortcut 过滤（根级 Uninstall.lnk 被跳过）', async () => {
    const dir = 'C:/StartMenuRoot'
    vi.mocked(fsPromises.readdir).mockResolvedValue([dirent('App1.lnk'), dirent('Uninstall.lnk')])
    vi.mocked(shell.readShortcutLink).mockReturnValue({ target: 'C:/x.exe' } as never)

    const apps: unknown[] = []
    await scanDirectoryFlat(dir, apps as never, new Map())

    const names = (apps as Array<{ name: string }>).map((a) => a.name)
    expect(names).toContain('App1')
    expect(names).not.toContain('Uninstall')
  })

  it('④ 正确填充 _dedupeTarget（目标路径）', async () => {
    const dir = 'C:/StartMenuRoot'
    vi.mocked(fsPromises.readdir).mockResolvedValue([dirent('App1.lnk')])
    vi.mocked(shell.readShortcutLink).mockReturnValue({
      target: 'C:/Program Files/App1/app1.exe'
    } as never)

    const apps: Array<{ _dedupeTarget?: string }> = []
    await scanDirectoryFlat(dir, apps as never, new Map())

    expect(apps[0]._dedupeTarget).toBe('C:/Program Files/App1/app1.exe')
  })

  it('.url 根级快捷方式也被收集（应用协议）', async () => {
    const dir = 'C:/StartMenuRoot'
    vi.mocked(fsPromises.readdir).mockResolvedValue([dirent('Steam.url')])
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      '[InternetShortcut]\nURL=steam://rungameid/1\nIconFile=C:/s.ico'
    )

    const apps: unknown[] = []
    await scanDirectoryFlat(dir, apps as never, new Map())

    expect(apps).toHaveLength(1)
    const app = apps[0] as { name: string; path: string }
    expect(app.name).toBe('Steam')
    expect(app.path).toBe('steam://rungameid/1')
  })
})

// ========== 4.4 scanApplications 集成 ==========

describe('scanApplications（Start Menu 根级 + Programs 子树集成）', () => {
  it('根级与 Programs 子树的 .lnk 均被索引，根级子目录内的不被索引', async () => {
    // 基于真实路径函数构造 mock 文件系统（path.join 在当前平台产生一致分隔符）
    const [programDataRoot, userRoot] = getWindowsRootScanPaths()
    const programDataPrograms = path.join(programDataRoot, 'Programs')
    const userPrograms = path.join(userRoot, 'Programs')

    const fsTree: Record<string, Dirent[]> = {
      // 系统级 Start Menu 根：根级 .lnk + Programs 子目录 + 一个普通根级子目录
      [programDataRoot]: [
        dirent('RootApp.lnk'),
        dirent('Uninstall.lnk'), // 应被 shouldSkipShortcut 过滤
        dirent('Programs', true), // Programs 子树（flat 不下钻，由递归 scanDirectory 覆盖）
        dirent('ExtraDir', true) // 根级普通子目录（flat 不下钻）
      ],
      // Programs 子树：深层 .lnk（递归扫描）
      [programDataPrograms]: [dirent('DeepApp.lnk')],
      // 根级普通子目录内的 .lnk：扁平扫描 MUST NOT 索引
      [path.join(programDataRoot, 'ExtraDir')]: [dirent('HiddenApp.lnk')],
      // 用户级根 + 用户级 Programs
      [userRoot]: [dirent('UserRootApp.lnk')],
      [userPrograms]: [dirent('UserProgramsApp.lnk')]
    }

    vi.mocked(fsPromises.readdir).mockImplementation(async (dirPath: unknown) => {
      return fsTree[dirPath as string] ?? []
    })
    // 每个 .lnk 解析出各自不同的目标（避免意外去重合并）
    vi.mocked(shell.readShortcutLink).mockImplementation((filePath: unknown) => {
      const base = path.basename(filePath as string)
      return { target: `C:/Program Files/${base}.exe` } as never
    })

    const result = await scanApplications()
    const names = result.map((a) => a.name).sort()

    // 根级 + Programs 子树的 .lnk 均被索引
    expect(names).toContain('RootApp')
    expect(names).toContain('UserRootApp')
    expect(names).toContain('DeepApp')
    expect(names).toContain('UserProgramsApp')

    // 根级子目录内的 .lnk 不被索引（扁平扫描核心不变式）
    expect(names).not.toContain('HiddenApp')
    // 卸载类快捷方式被过滤
    expect(names).not.toContain('Uninstall')

    // 精确：恰好 4 个
    expect(names).toEqual(['DeepApp', 'RootApp', 'UserProgramsApp', 'UserRootApp'])
  })

  it('getWindowsScanPaths / getWindowsRootScanPaths 路径互补（sanity check）', () => {
    // 确保测试 mock 文件系统与路径函数一致
    const [programDataRoot] = getWindowsRootScanPaths()
    expect(getWindowsScanPaths()).toContain(path.join(programDataRoot, 'Programs'))
  })
})

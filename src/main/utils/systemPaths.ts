import { app } from 'electron'
import os from 'os'
import path from 'path'

/**
 * 获取 Windows 开始菜单路径
 */
export function getWindowsScanPaths(): string[] {
  // 系统级开始菜单
  const programDataStartMenu = path.join(
    'C:',
    'ProgramData',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  )

  // 用户级开始菜单
  const userStartMenu = path.join(
    os.homedir(),
    'AppData',
    'Roaming',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  )

  // 用户桌面（使用 Electron API 获取真实路径，支持桌面被移到其他位置的情况）
  const userDesktop = app.getPath('desktop')

  // 公共桌面
  const publicDesktop = path.join('C:', 'Users', 'Public', 'Desktop')

  return [programDataStartMenu, userStartMenu, userDesktop, publicDesktop]
}

/**
 * 获取 Windows 开始菜单 **根** 扫描路径（不含 `Programs` 子文件夹）。
 *
 * Windows 允许将 `.lnk` / `.url` 直接放在 `Start Menu\` 根目录下
 * （用户级与系统级均如此），这些快捷方式在开始菜单中可见。
 * 但 `getWindowsScanPaths()` 把开始菜单路径硬编码到 `...\Start Menu\Programs`，
 * 递归扫描从该子文件夹起，故根级快捷方式会被遗漏（issue #551）。
 *
 * 本函数返回两条 Start Menu 根路径，供扁平（非递归）扫描与监听使用：
 * 仅扫描根级直接文件，不下钻子目录（`Programs` 子树由 `getWindowsScanPaths` 递归覆盖）。
 */
export function getWindowsRootScanPaths(): string[] {
  // 系统级开始菜单根
  const programDataStartMenuRoot = path.join(
    'C:',
    'ProgramData',
    'Microsoft',
    'Windows',
    'Start Menu'
  )

  // 用户级开始菜单根
  const userStartMenuRoot = path.join(
    os.homedir(),
    'AppData',
    'Roaming',
    'Microsoft',
    'Windows',
    'Start Menu'
  )

  return [programDataStartMenuRoot, userStartMenuRoot]
}

/**
 * 获取 macOS 应用目录路径
 */
export function getMacApplicationPaths(): string[] {
  return ['/Applications', '/System/Applications', `${process.env.HOME}/Applications`]
}

/**
 * 获取 Linux XDG 应用目录路径（遵循 XDG Base Directory 规范）
 * 包含用户级和系统级 .desktop 文件目录
 */
export function getLinuxApplicationPaths(): string[] {
  const home = os.homedir()
  const xdgDataDirs = process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share'
  const baseDirs = xdgDataDirs.split(':').filter(Boolean)

  const paths = [
    path.join(home, '.local/share/applications'), // 用户安装的应用
    ...baseDirs.map((dir) => path.join(dir, 'applications')) // 系统安装的应用
  ]

  return [...new Set(paths)] // 去重
}

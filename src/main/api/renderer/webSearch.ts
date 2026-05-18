import { ipcMain, net } from 'electron'
import { randomUUID } from 'crypto'
import windowManager from '../../managers/windowManager'
import databaseAPI from '../shared/database'
import commandsAPI from './commands'
import { filterSuperPanelPinnedCommands } from '../../core/superPanelPinnedCommands'

export type WebSearchEngineType = 'search' | 'webpage'

/**
 * 网页快开搜索引擎数据结构
 */
export interface WebSearchEngine {
  id: string // 唯一 ID (uuid)
  name: string // 搜索引擎名称
  url: string // URL 模板，{q} 为关键词占位符
  icon: string // favicon (base64 或 URL)
  enabled: boolean // 是否启用
  type: WebSearchEngineType // search: 模板搜索, webpage: 直接打开网页
  keyword?: string // 网页类型的匹配关键字
}

/**
 * 网页快开 API
 */
class WebSearchAPI {
  private readonly DB_KEY = 'web-search-engines' // databaseAPI 会自动添加 ZTOOLS/ 前缀

  public init(): void {
    this.setupIPC()
  }

  private setupIPC(): void {
    ipcMain.handle('web-search:get-all', async () => {
      try {
        const engines = this.getAllEngines()
        return { success: true, data: engines }
      } catch (error: unknown) {
        console.error('[WebSearch] 获取搜索引擎列表失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })

    ipcMain.handle('web-search:add', async (_event, engine: WebSearchEngine) => {
      try {
        return await this.addEngine(engine)
      } catch (error: unknown) {
        console.error('[WebSearch] 添加搜索引擎失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })

    ipcMain.handle('web-search:update', async (_event, engine: WebSearchEngine) => {
      try {
        return await this.updateEngine(engine)
      } catch (error: unknown) {
        console.error('[WebSearch] 更新搜索引擎失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })

    ipcMain.handle('web-search:delete', async (_event, engineId: string) => {
      try {
        return await this.deleteEngine(engineId)
      } catch (error: unknown) {
        console.error('[WebSearch] 删除搜索引擎失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })

    ipcMain.handle('web-search:fetch-favicon', async (_event, url: string) => {
      try {
        const icon = await this.fetchFavicon(url)
        return { success: true, data: icon }
      } catch (error: unknown) {
        console.error('[WebSearch] 获取 favicon 失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })
  }

  /**
   * 获取所有搜索引擎
   */
  public getAllEngines(): WebSearchEngine[] {
    try {
      const data = databaseAPI.dbGet(this.DB_KEY)
      if (data && Array.isArray(data)) {
        return data.map((engine) => this.normalizeEngine(engine))
      }
      return []
    } catch {
      return []
    }
  }

  /**
   * 添加搜索引擎
   */
  public async addEngine(engine: WebSearchEngine): Promise<{ success: boolean; error?: string }> {
    const validated = this.validateAndNormalizeEngine(engine, false)
    if (!validated.success) {
      return { success: false, error: validated.error }
    }
    const normalizedEngine = validated.engine!

    const engines = this.getAllEngines()

    // 自动生成 ID
    if (!normalizedEngine.id) {
      normalizedEngine.id = randomUUID()
    }

    // 检查重复 ID
    if (engines.some((e) => e.id === normalizedEngine.id)) {
      return { success: false, error: '该搜索引擎 ID 已存在' }
    }

    engines.push(normalizedEngine)
    databaseAPI.dbPut(this.DB_KEY, engines)

    this.notifyCommandsChanged()

    return { success: true }
  }

  /**
   * 更新搜索引擎
   */
  public async updateEngine(
    engine: WebSearchEngine
  ): Promise<{ success: boolean; error?: string }> {
    const validated = this.validateAndNormalizeEngine(engine, true)
    if (!validated.success) {
      return { success: false, error: validated.error }
    }
    const normalizedEngine = validated.engine!

    const engines = this.getAllEngines()
    const index = engines.findIndex((e) => e.id === normalizedEngine.id)
    if (index === -1) {
      return { success: false, error: '未找到该搜索引擎' }
    }

    engines[index] = normalizedEngine
    databaseAPI.dbPut(this.DB_KEY, engines)

    this.notifyCommandsChanged()

    return { success: true }
  }

  /**
   * 删除搜索引擎
   */
  public async deleteEngine(engineId: string): Promise<{ success: boolean; error?: string }> {
    const engines = this.getAllEngines()
    const index = engines.findIndex((e) => e.id === engineId)
    if (index === -1) {
      return { success: false, error: '未找到该搜索引擎' }
    }

    const featureCode = `web-search-${engines[index].id}`

    engines.splice(index, 1)
    databaseAPI.dbPut(this.DB_KEY, engines)

    this.cleanupDeletedFeatureReferences(featureCode)
    this.notifyCommandsChanged()

    return { success: true }
  }

  private cleanupDeletedFeatureReferences(featureCode: string): void {
    const cleanupTargets = [
      { key: 'command-history', channel: 'history-changed' },
      { key: 'pinned-commands', channel: 'pinned-changed' },
      { key: 'command-usage-stats' },
      { key: 'super-panel-pinned', channel: 'super-panel-pinned-changed' }
    ]

    for (const target of cleanupTargets) {
      try {
        const data = databaseAPI.dbGet(target.key)
        if (!Array.isArray(data)) continue

        const result =
          target.key === 'super-panel-pinned'
            ? filterSuperPanelPinnedCommands(data, { featureCode })
            : this.filterDeletedFeatureFromList(data, featureCode)

        if (!result.changed) continue

        databaseAPI.dbPut(target.key, result.items)
        if (target.channel) {
          windowManager.getMainWindow()?.webContents.send(target.channel)
        }
      } catch (error) {
        console.error(`[WebSearch] 清理已删除网页快开引用失败: ${target.key}`, error)
      }
    }
  }

  private filterDeletedFeatureFromList(
    items: any[],
    featureCode: string
  ): { items: any[]; changed: boolean } {
    const nextItems = items.filter((item) => item?.featureCode !== featureCode)
    return {
      items: nextItems,
      changed: nextItems.length !== items.length
    }
  }

  /**
   * 获取搜索引擎对应的插件 features（用于合并到系统插件）
   */
  public async getSearchEngineFeatures(): Promise<any[]> {
    const engines = this.getAllEngines()
    return engines
      .filter((e) => e.enabled)
      .flatMap((e): any[] => {
        const baseFeature = {
          code: `web-search-${e.id}`,
          explain: e.name,
          icon: e.icon || ''
        }

        if (e.type === 'webpage') {
          const keyword = e.keyword?.trim()
          if (!keyword) return []
          return [
            {
              ...baseFeature,
              cmds: [keyword]
            }
          ]
        }

        return [
          {
            ...baseFeature,
            cmds: [
              {
                type: 'over',
                label: e.name,
                minLength: 1
              }
            ]
          }
        ]
      })
  }

  /**
   * 根据 featureCode 获取搜索引擎配置
   */
  public async getEngineByFeatureCode(featureCode: string): Promise<WebSearchEngine | null> {
    const prefix = 'web-search-'
    if (!featureCode.startsWith(prefix)) {
      return null
    }
    const engineId = featureCode.substring(prefix.length)
    const engines = this.getAllEngines()
    return engines.find((e) => e.id === engineId) || null
  }

  /**
   * 获取网站 favicon
   * 解析目标网站 HTML，提取 <link rel="icon"> 标签获取 favicon URL，
   * 然后下载图标并转为 base64
   */
  public async fetchFavicon(url: string): Promise<string> {
    try {
      const candidateUrl = this.ensureUrlProtocol(url.replace('{q}', 'test').trim())
      const urlObj = new URL(candidateUrl)
      const origin = urlObj.origin

      // 先尝试请求网页获取 favicon link。部分站点的压缩响应会导致 Electron net
      // 解码失败，这里只跳过 HTML 解析，仍继续回退到 /favicon.ico。
      try {
        const html = await this.httpGet(`${origin}/`)
        const faviconUrl = this.parseFaviconFromHtml(html, origin)

        if (faviconUrl) {
          const base64 = await this.downloadAsBase64(faviconUrl)
          if (base64) return base64
        }
      } catch (error) {
        console.warn('[WebSearch] 获取页面 HTML 失败，回退到 /favicon.ico:', error)
      }

      // 回退到 /favicon.ico
      const fallbackBase64 = await this.downloadAsBase64(`${origin}/favicon.ico`)
      if (fallbackBase64) return fallbackBase64

      return ''
    } catch (error) {
      console.error('[WebSearch] fetchFavicon error:', error)
      return ''
    }
  }

  private normalizeEngine(engine: any): WebSearchEngine {
    const type: WebSearchEngineType = engine?.type === 'webpage' ? 'webpage' : 'search'
    return {
      id: typeof engine?.id === 'string' ? engine.id : '',
      name: typeof engine?.name === 'string' ? engine.name.trim() : '',
      url: typeof engine?.url === 'string' ? engine.url.trim() : '',
      icon: typeof engine?.icon === 'string' ? engine.icon : '',
      enabled: typeof engine?.enabled === 'boolean' ? engine.enabled : true,
      type,
      keyword: typeof engine?.keyword === 'string' ? engine.keyword.trim() : ''
    }
  }

  private validateAndNormalizeEngine(
    engine: WebSearchEngine,
    requireId: boolean
  ): { success: boolean; engine?: WebSearchEngine; error?: string } {
    const normalized = this.normalizeEngine(engine)

    if (requireId && !normalized.id) {
      return { success: false, error: 'ID 不能为空' }
    }
    if (!normalized.name || !normalized.url) {
      return { success: false, error: '名称和 URL 不能为空' }
    }

    if (normalized.type === 'webpage') {
      if (!normalized.keyword) {
        return { success: false, error: '匹配关键字不能为空' }
      }
      if (normalized.url.includes('{q}')) {
        return { success: false, error: '网页 URL 不能包含 {q} 占位符' }
      }
      const urlResult = this.normalizeHttpUrl(normalized.url)
      if (!urlResult.success) {
        return { success: false, error: '网页 URL 必须是有效的 http/https 地址' }
      }
      normalized.url = urlResult.url!
      return { success: true, engine: normalized }
    }

    if (!normalized.url.includes('{q}')) {
      return { success: false, error: '搜索引擎 URL 必须包含 {q} 占位符' }
    }
    normalized.url = this.ensureUrlProtocol(normalized.url)
    const urlResult = this.normalizeHttpUrl(normalized.url.replace('{q}', 'test'))
    if (!urlResult.success) {
      return { success: false, error: '搜索引擎 URL 必须是有效的 http/https 地址' }
    }
    normalized.keyword = ''
    return { success: true, engine: normalized }
  }

  private normalizeHttpUrl(rawUrl: string): { success: boolean; url?: string } {
    const candidate = this.ensureUrlProtocol(rawUrl.trim())
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false }
      }
      return { success: true, url: parsed.toString() }
    } catch {
      return { success: false }
    }
  }

  private ensureUrlProtocol(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url
    }
    return `https://${url}`
  }

  /**
   * 从 HTML 中解析 favicon URL
   */
  private parseFaviconFromHtml(html: string, origin: string): string {
    // 匹配 <link rel="icon" href="..."> 或 <link rel="shortcut icon" href="...">
    const linkRegex = /<link[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["'][^>]*>/gi
    const altRegex = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*>/gi

    const match = linkRegex.exec(html) || altRegex.exec(html)
    if (match?.[1]) {
      const href = match[1]
      // 处理相对路径
      if (href.startsWith('//')) {
        return `https:${href}`
      } else if (href.startsWith('/')) {
        return `${origin}${href}`
      } else if (href.startsWith('http')) {
        return href
      } else {
        return `${origin}/${href}`
      }
    }

    return ''
  }

  /**
   * HTTP GET 请求，返回文本内容
   */
  private httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = net.request(url)
      let data = ''
      let resolved = false
      const fail = (error: Error): void => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          reject(error)
        }
      }
      const done = (value: string): void => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          request.abort()
          reject(new Error('请求超时'))
        }
      }, 10000)

      request.on('response', (response) => {
        response.on('error', fail)

        // 处理重定向
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          clearTimeout(timeout)
          resolved = true
          const location = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location
          this.httpGet(location).then(resolve).catch(reject)
          return
        }

        response.on('data', (chunk) => {
          data += chunk.toString()
          // 只读取前 100KB，足够解析 head 中的 favicon
          if (data.length > 100 * 1024) {
            request.abort()
            done(data)
          }
        })
        response.on('end', () => {
          done(data)
        })
      })

      request.on('error', fail)

      request.setHeader('Accept-Encoding', 'identity')
      request.end()
    })
  }

  /**
   * 下载 URL 内容并转为 base64
   */
  private downloadAsBase64(url: string): Promise<string> {
    return new Promise((resolve) => {
      const request = net.request(url)
      const chunks: Buffer[] = []
      let resolved = false
      const done = (value: string): void => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          request.abort()
          resolve('')
        }
      }, 10000)

      request.on('response', (response) => {
        response.on('error', () => {
          done('')
        })

        // 处理重定向
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          clearTimeout(timeout)
          resolved = true
          const location = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location
          this.downloadAsBase64(location).then(resolve)
          return
        }

        if (response.statusCode !== 200) {
          done('')
          return
        }

        const contentType =
          (Array.isArray(response.headers['content-type'])
            ? response.headers['content-type'][0]
            : response.headers['content-type']) || 'image/x-icon'

        response.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk))
        })
        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          if (buffer.length > 0) {
            const mimeType = contentType.split(';')[0].trim()
            done(`data:${mimeType};base64,${buffer.toString('base64')}`)
          } else {
            done('')
          }
        })
      })

      request.on('error', () => {
        done('')
      })

      request.setHeader('Accept-Encoding', 'identity')
      request.end()
    })
  }

  /**
   * 通知前端命令列表已变化
   */
  private notifyCommandsChanged(): void {
    // 清除 commands 缓存
    ;(commandsAPI as any).cachedCommandsResult = null

    // 通知渲染进程
    const mainWindow = windowManager.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('plugins-changed')
    }
  }
}

export default new WebSearchAPI()

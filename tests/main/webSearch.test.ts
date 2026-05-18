import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'

const mockDbGet = vi.hoisted(() => vi.fn())
const mockDbPut = vi.hoisted(() => vi.fn())
const mockGetMainWindow = vi.hoisted(() => vi.fn())
const mockNetRequest = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  net: {
    request: mockNetRequest
  }
}))

vi.mock('../../src/main/api/shared/database', () => ({
  default: {
    dbGet: mockDbGet,
    dbPut: mockDbPut
  }
}))

vi.mock('../../src/main/managers/windowManager', () => ({
  default: {
    getMainWindow: mockGetMainWindow
  }
}))

vi.mock('../../src/main/api/renderer/commands', () => ({
  default: {}
}))

import webSearchAPI from '../../src/main/api/renderer/webSearch'

describe('webSearchAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbGet.mockReturnValue([])
    mockGetMainWindow.mockReturnValue(null)
  })

  it('rejects search engines without a query placeholder', async () => {
    const result = await webSearchAPI.addEngine({
      id: '',
      name: 'Google',
      url: 'https://www.google.com/search',
      icon: '',
      enabled: true,
      type: 'search'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('{q}')
    expect(mockDbPut).not.toHaveBeenCalled()
  })

  it('validates and normalizes webpage entries', async () => {
    const result = await webSearchAPI.addEngine({
      id: 'webpage-1',
      name: 'Example',
      url: 'example.com',
      icon: '',
      enabled: true,
      type: 'webpage',
      keyword: 'example'
    })

    expect(result).toEqual({ success: true })
    expect(mockDbPut).toHaveBeenCalledWith('web-search-engines', [
      {
        id: 'webpage-1',
        name: 'Example',
        url: 'https://example.com/',
        icon: '',
        enabled: true,
        type: 'webpage',
        keyword: 'example'
      }
    ])
  })

  it('normalizes search engine templates with missing protocols', async () => {
    const result = await webSearchAPI.addEngine({
      id: 'search-1',
      name: 'Search',
      url: 'example.com/search?q={q}',
      icon: '',
      enabled: true,
      type: 'search'
    })

    expect(result).toEqual({ success: true })
    expect(mockDbPut).toHaveBeenCalledWith('web-search-engines', [
      {
        id: 'search-1',
        name: 'Search',
        url: 'https://example.com/search?q={q}',
        icon: '',
        enabled: true,
        type: 'search',
        keyword: ''
      }
    ])
  })

  it('rejects webpage entries with query placeholders or missing keywords', async () => {
    const withPlaceholder = await webSearchAPI.addEngine({
      id: '',
      name: 'Bad webpage',
      url: 'https://example.com?q={q}',
      icon: '',
      enabled: true,
      type: 'webpage',
      keyword: 'bad'
    })
    const withoutKeyword = await webSearchAPI.addEngine({
      id: '',
      name: 'No keyword',
      url: 'https://example.com',
      icon: '',
      enabled: true,
      type: 'webpage',
      keyword: ''
    })

    expect(withPlaceholder.success).toBe(false)
    expect(withoutKeyword.success).toBe(false)
    expect(mockDbPut).not.toHaveBeenCalled()
  })

  it('generates match features for search engines and text features for webpages', async () => {
    mockDbGet.mockReturnValue([
      {
        id: 'search-1',
        name: 'Google',
        url: 'https://www.google.com/search?q={q}',
        icon: 'google-icon',
        enabled: true,
        type: 'search'
      },
      {
        id: 'webpage-1',
        name: 'Example',
        url: 'https://example.com/',
        icon: 'example-icon',
        enabled: true,
        type: 'webpage',
        keyword: 'example'
      },
      {
        id: 'disabled-1',
        name: 'Disabled',
        url: 'https://disabled.example.com/',
        icon: '',
        enabled: false,
        type: 'webpage',
        keyword: 'disabled'
      }
    ])

    await expect(webSearchAPI.getSearchEngineFeatures()).resolves.toEqual([
      {
        code: 'web-search-search-1',
        explain: 'Google',
        icon: 'google-icon',
        cmds: [{ type: 'over', label: 'Google', minLength: 1 }]
      },
      {
        code: 'web-search-webpage-1',
        explain: 'Example',
        icon: 'example-icon',
        cmds: ['example']
      }
    ])
  })

  it('removes deleted webpage commands from history, pins, stats, and super panel pins', async () => {
    const send = vi.fn()
    mockGetMainWindow.mockReturnValue({ webContents: { send } })
    mockDbGet.mockImplementation((key: string) => {
      if (key === 'web-search-engines') {
        return [
          {
            id: 'webpage-1',
            name: 'Example',
            url: 'https://example.com/',
            icon: '',
            enabled: true,
            type: 'webpage',
            keyword: 'example'
          },
          {
            id: 'webpage-2',
            name: 'Keep',
            url: 'https://keep.example.com/',
            icon: '',
            enabled: true,
            type: 'webpage',
            keyword: 'keep'
          }
        ]
      }
      if (key === 'command-history') {
        return [
          { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-1' },
          { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
        ]
      }
      if (key === 'pinned-commands') {
        return [
          { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-1' },
          { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
        ]
      }
      if (key === 'command-usage-stats') {
        return [
          { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-1' },
          { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
        ]
      }
      if (key === 'super-panel-pinned') {
        return [
          {
            isFolder: true,
            name: 'Folder',
            items: [
              { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-1' },
              { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
            ]
          }
        ]
      }
      return []
    })

    await expect(webSearchAPI.deleteEngine('webpage-1')).resolves.toEqual({ success: true })

    expect(mockDbPut).toHaveBeenCalledWith('web-search-engines', [
      {
        id: 'webpage-2',
        name: 'Keep',
        url: 'https://keep.example.com/',
        icon: '',
        enabled: true,
        type: 'webpage',
        keyword: 'keep'
      }
    ])
    expect(mockDbPut).toHaveBeenCalledWith('command-history', [
      { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
    ])
    expect(mockDbPut).toHaveBeenCalledWith('pinned-commands', [
      { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
    ])
    expect(mockDbPut).toHaveBeenCalledWith('command-usage-stats', [
      { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
    ])
    expect(mockDbPut).toHaveBeenCalledWith('super-panel-pinned', [
      { path: '/system', type: 'plugin', featureCode: 'web-search-webpage-2' }
    ])
    expect(send).toHaveBeenCalledWith('history-changed')
    expect(send).toHaveBeenCalledWith('pinned-changed')
    expect(send).toHaveBeenCalledWith('super-panel-pinned-changed')
    expect(send).toHaveBeenCalledWith('plugins-changed')
  })

  it('falls back to favicon.ico when the page html response fails to decode', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockNetRequest.mockImplementation((url: string) => {
      const request = new EventEmitter() as EventEmitter & {
        setHeader: ReturnType<typeof vi.fn>
        abort: ReturnType<typeof vi.fn>
        end: () => void
      }
      request.setHeader = vi.fn()
      request.abort = vi.fn()
      request.end = () => {
        queueMicrotask(() => {
          const response = new EventEmitter() as EventEmitter & {
            statusCode: number
            headers: Record<string, string>
          }
          response.statusCode = 200
          response.headers = url.endsWith('/favicon.ico') ? { 'content-type': 'image/x-icon' } : {}
          request.emit('response', response)

          queueMicrotask(() => {
            if (url.endsWith('/favicon.ico')) {
              response.emit('data', Buffer.from([1, 2, 3]))
              response.emit('end')
            } else {
              response.emit('error', new Error('net::ERR_CONTENT_DECODING_FAILED'))
            }
          })
        })
      }
      return request
    })

    await expect(webSearchAPI.fetchFavicon('https://pan.baidu.com')).resolves.toBe(
      'data:image/x-icon;base64,AQID'
    )
    expect(mockNetRequest).toHaveBeenCalledWith('https://pan.baidu.com/')
    expect(mockNetRequest).toHaveBeenCalledWith('https://pan.baidu.com/favicon.ico')
    warnSpy.mockRestore()
  })
})

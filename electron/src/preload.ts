import type { IpcRendererEvent } from 'electron'
import { contextBridge, ipcRenderer } from 'electron'

export interface WatchEvent {
  event: 'fs:watch'
  type: 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export interface FSEntryPlain {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }

export interface PerfMetrics {
  mainMetrics: { cpu: number; mem: number } | null
  rendererMetrics: { cpu: number; mem: number } | null
}

export interface ElectronAPI {
  isElectron: boolean
  backendPort: number
  platform: string
  updateTheme: (theme: 'dark' | 'light') => void
  pingBackend: () => Promise<Result<string>>
  openFileDialog: (options: {
    mode: 'file' | 'directory'
    extension?: string
  }) => Promise<Result<{ canceled: boolean; filePaths: string[] }>>
  readFile: (filePath: string) => Promise<Result<string>>
  writeFile: (filePath: string, content: string) => Promise<Result<void>>
  mkdir: (dirPath: string) => Promise<Result<void>>
  delete: (filePath: string) => Promise<Result<void>>
  rename: (oldPath: string, newPath: string) => Promise<Result<void>>
  readdir: (dirPath: string) => Promise<Result<string[]>>
  readdirWithTypes: (dirPath: string) => Promise<Result<FSEntryPlain[]>>
  exists: (filePath: string) => Promise<Result<boolean>>
  watchDirectory: (dirPath: string) => Promise<Result<void>>
  onWatch: (handler: (event: WatchEvent) => void) => () => void
  refreshProjectRoots: () => Promise<Result<{ count: number }>>
  addProjectRoot: (directory: string) => Promise<Result<{ count: number }>>
  compileOpenSCAD: (
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ) => Promise<
    Result<{
      blob: Uint8Array | null
      format: 'off' | 'stl' | 'svg' | null
      stdout: string[]
      stderr: string[]
      error: boolean
      parameterSet?: unknown
    }>
  >
  exportOpenSCAD: (
    main: { path: string; code: string },
    format: string,
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ) => Promise<
    Result<{
      blob: Uint8Array | null
      format: string | null
      stdout: string[]
      stderr: string[]
      error: boolean
    }>
  >
  checkSyntaxOpenSCAD: (
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ) => Promise<
    Result<{
      blob: null
      format: null
      stdout: string[]
      stderr: string[]
      error: boolean
      parameterSet?: unknown
    }>
  >
  executeOpenSCAD: (request: {
    action: 'compile' | 'export' | 'checkSyntax'
    main: { path: string; code: string }
    overrides?: Record<string, { content: string }>
    projectDirectory?: string
    vars?: Record<string, unknown>
    format?: string
  }) => Promise<
    Result<{
      blob: Uint8Array | null
      format: string | null
      stdout: string[]
      stderr: string[]
      error: boolean
      parameterSet?: unknown
    }>
  >
  onMetrics: (handler: (metrics: PerfMetrics) => void) => () => void
}

// Find --backend-port in process.argv
const portArg = process.argv.find((arg) => arg.startsWith('--backend-port='))
const backendPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3000

const api: ElectronAPI = {
  isElectron: true,
  backendPort,
  platform: process.platform,
  updateTheme: (theme) => ipcRenderer.send('theme:change', theme),
  pingBackend: () => ipcRenderer.invoke('backend:ping'),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  readFile: (filePath) => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('fs:write', filePath, content),
  mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  delete: (filePath) => ipcRenderer.invoke('fs:delete', filePath),
  rename: (oldPath, newPath) =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  readdir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
  readdirWithTypes: (dirPath) =>
    ipcRenderer.invoke('fs:readdirWithTypes', dirPath),
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  watchDirectory: (dirPath) => ipcRenderer.invoke('workspace:watch', dirPath),
  refreshProjectRoots: () => ipcRenderer.invoke('projects:refresh-roots'),
  addProjectRoot: (directory) =>
    ipcRenderer.invoke('projects:add-root', directory),
  compileOpenSCAD: (main, overrides, projectDirectory, vars) =>
    ipcRenderer.invoke(
      'openscad:compile',
      main,
      overrides,
      projectDirectory,
      vars,
    ),
  exportOpenSCAD: (main, format, overrides, projectDirectory, vars) =>
    ipcRenderer.invoke(
      'openscad:export',
      main,
      format,
      overrides,
      projectDirectory,
      vars,
    ),
  checkSyntaxOpenSCAD: (main, overrides, projectDirectory) =>
    ipcRenderer.invoke(
      'openscad:checkSyntax',
      main,
      overrides,
      projectDirectory,
    ),
  executeOpenSCAD: (request) => ipcRenderer.invoke('openscad:execute', request),
  onWatch: (handler) => {
    const listener = (_event: IpcRendererEvent, data: WatchEvent) =>
      handler(data)
    ipcRenderer.on('file-changed', listener)
    return () => {
      ipcRenderer.removeListener('file-changed', listener)
    }
  },
  onMetrics: (handler) => {
    const listener = (_event: IpcRendererEvent, data: PerfMetrics) =>
      handler(data)
    ipcRenderer.on('perf-metrics', listener)
    return () => {
      ipcRenderer.removeListener('perf-metrics', listener)
    }
  },
}

contextBridge.exposeInMainWorld('electron', api)
export type { api }

import type { IpcRendererEvent } from 'electron'
import { contextBridge, ipcRenderer } from 'electron'
// Preload compiles to CommonJS but 'shared' ships ESM only — import types
// only here (fully erased at compile time) so no runtime require() happens.
import type { AppSettings, ResolvedTheme, ThemeSetting } from 'shared'

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
  // Theme preference and its OS-resolved value at window-creation time,
  // passed synchronously via additionalArguments to avoid a flash of the
  // wrong theme while the async settings IPC call resolves.
  initialTheme: ThemeSetting
  initialResolvedTheme: ResolvedTheme
  getSettings: () => Promise<Result<AppSettings>>
  setTheme: (theme: ThemeSetting) => Promise<Result<ResolvedTheme>>
  onThemeUpdated: (handler: (theme: ResolvedTheme) => void) => () => void
  pingBackend: () => Promise<Result<string>>
  storeCredential: (providerId: string, auth: unknown) => Promise<Result<void>>
  isEncryptionAvailable: () => Promise<Result<boolean>>
  openExternal: (url: string) => Promise<Result<void>>
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

const themeArg = process.argv.find((arg) => arg.startsWith('--initial-theme='))
const initialTheme = (
  themeArg ? themeArg.split('=')[1] : 'system'
) as ThemeSetting

const resolvedThemeArg = process.argv.find((arg) =>
  arg.startsWith('--initial-resolved-theme='),
)
const initialResolvedTheme = (
  resolvedThemeArg ? resolvedThemeArg.split('=')[1] : 'light'
) as ResolvedTheme

const api: ElectronAPI = {
  isElectron: true,
  backendPort,
  platform: process.platform,
  initialTheme,
  initialResolvedTheme,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  onThemeUpdated: (handler) => {
    const listener = (_event: IpcRendererEvent, theme: ResolvedTheme) =>
      handler(theme)
    ipcRenderer.on('theme:updated', listener)
    return () => {
      ipcRenderer.removeListener('theme:updated', listener)
    }
  },
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
  storeCredential: (providerId, auth) =>
    ipcRenderer.invoke('credentials:store', providerId, auth),
  isEncryptionAvailable: () =>
    ipcRenderer.invoke('credentials:is-encryption-available'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
}

contextBridge.exposeInMainWorld('electron', api)
export type { api }

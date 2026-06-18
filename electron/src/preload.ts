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

export interface ElectronAPI {
  isElectron: boolean
  backendPort: number
  pingBackend: () => Promise<Result<string>>
  openFileDialog: (options: {
    mode: 'file' | 'directory'
    extension?: string
  }) => Promise<Result<{ canceled: boolean; filePaths: string[] }>>
  readFile: (filePath: string) => Promise<Result<string>>
  writeFile: (filePath: string, content: string) => Promise<Result<void>>
  readdir: (dirPath: string) => Promise<Result<string[]>>
  readdirWithTypes: (dirPath: string) => Promise<Result<FSEntryPlain[]>>
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
      format: 'stl' | 'svg' | null
      stdout: string[]
      stderr: string[]
      error: boolean
      parameterSet?: unknown
    }>
  >
  exportSTLOpenSCAD: (
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ) => Promise<
    Result<{
      blob: Uint8Array | null
      format: 'stl' | 'svg' | null
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
}

// Find --backend-port in process.argv
const portArg = process.argv.find((arg) => arg.startsWith('--backend-port='))
const backendPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3000

const api: ElectronAPI = {
  isElectron: true,
  backendPort,
  pingBackend: () => ipcRenderer.invoke('backend:ping'),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  readFile: (filePath) => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('fs:write', filePath, content),
  readdir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
  readdirWithTypes: (dirPath) =>
    ipcRenderer.invoke('fs:readdirWithTypes', dirPath),
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
  exportSTLOpenSCAD: (main, overrides, projectDirectory, vars) =>
    ipcRenderer.invoke(
      'openscad:exportSTL',
      main,
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
  onWatch: (handler) => {
    const listener = (_event: IpcRendererEvent, data: WatchEvent) =>
      handler(data)
    ipcRenderer.on('file-changed', listener)
    return () => {
      ipcRenderer.removeListener('file-changed', listener)
    }
  },
}

contextBridge.exposeInMainWorld('electron', api)
export type { api }

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

export interface OpenSCADRequest {
  action: 'compile' | 'export' | 'checkSyntax'
  main: { path: string; code: string }
  overrides?: Record<string, { content: string }>
  projectDirectory?: string
  vars?: Record<string, unknown>
  format?: string
}

export interface OpenSCADIpcResult {
  blob: Uint8Array | null
  format: string | null
  stdout: string[]
  stderr: string[]
  error: boolean
  parameterSet?: unknown
}

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
  ) => Promise<Result<OpenSCADIpcResult>>
  exportOpenSCAD: (
    main: { path: string; code: string },
    format: string,
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ) => Promise<Result<OpenSCADIpcResult>>
  checkSyntaxOpenSCAD: (
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ) => Promise<Result<OpenSCADIpcResult>>
  executeOpenSCAD: (
    request: OpenSCADRequest,
  ) => Promise<Result<OpenSCADIpcResult>>
  onMetrics: (handler: (metrics: PerfMetrics) => void) => () => void
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

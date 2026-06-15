/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn } from 'child_process'
import type { FSWatcher } from 'chokidar' with { 'resolution-mode': 'import' }
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }

function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('INVALID_INPUT', `${name} must be a non-empty string`)
  }
  return value
}

function validateObject(value: unknown, name: string): Record<string, any> {
  if (typeof value !== 'object' || value === null) {
    throw new AppError('INVALID_INPUT', `${name} must be an object`)
  }
  return value as Record<string, any>
}

function createHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult,
) {
  return async (
    _event: Electron.IpcMainInvokeEvent,
    ...args: TArgs
  ): Promise<Result<TResult>> => {
    try {
      const data = await fn(...args)
      return {
        success: true,
        data,
      }
    } catch (error: unknown) {
      console.error('IPC Handler error:', error)

      let code = 'INTERNAL_ERROR'
      let message: string

      if (error instanceof AppError) {
        code = error.code
        message = error.message
      } else if (error instanceof Error) {
        const sysError = error as Error & { code?: string }
        if (sysError.code === 'ENOENT') {
          code = 'FILE_NOT_FOUND'
          message = 'The specified file or directory was not found'
        } else if (sysError.code === 'EACCES' || sysError.code === 'EPERM') {
          code = 'PERMISSION_DENIED'
          message = 'Permission denied accessing the specified path'
        } else if (error.message.startsWith('Access Denied')) {
          code = 'ACCESS_DENIED'
          message = error.message
        } else {
          code = 'FS_ERROR'
          message = error.message
        }
      } else {
        message = String(error)
      }

      return {
        success: false,
        error: {
          code,
          message,
        },
      }
    }
  }
}

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('Another instance is already running. Exiting...')
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

let mainWindow: BrowserWindow | null = null
let backendProcess: ReturnType<typeof spawn> | null = null
let backendPort = 3000
let dirWatcher: FSWatcher | null = null
let watchedDirPath: string | null = null

// Security sandbox for allowed workspace roots
const allowedWorkspaceRoots = new Set<string>()

function getBackendUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

async function loadAllowedWorkspaceRoots(port: number) {
  try {
    const res = await fetch(`${getBackendUrl(port)}/api/projects`)
    if (res.ok) {
      const projects = (await res.json()) as { directory: string }[]
      for (const p of projects) {
        if (p.directory) {
          allowedWorkspaceRoots.add(path.resolve(p.directory))
        }
      }
      console.log(
        `Loaded ${allowedWorkspaceRoots.size} allowed workspace roots from database.`,
      )
    }
  } catch (err) {
    console.error('Failed to load projects from backend database:', err)
  }
}

function validatePath(filePath: string): string {
  if (!filePath) {
    throw new AppError('INVALID_INPUT', 'Path is required')
  }
  const resolved = path.resolve(filePath)
  if (!path.isAbsolute(resolved)) {
    throw new AppError('INVALID_INPUT', 'Expected absolute path')
  }

  let allowed = false
  for (const root of allowedWorkspaceRoots) {
    const relative = path.relative(root, resolved)
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      allowed = true
      break
    }
  }

  if (!allowed) {
    throw new AppError(
      'ACCESS_DENIED',
      `Access Denied: Path is outside allowed workspaces: ${resolved}`,
    )
  }

  return resolved
}

async function findFreePort(startPort: number = 3000): Promise<number> {
  let port = startPort
  while (true) {
    const isFree = await new Promise<boolean>((resolve) => {
      const server = net.createServer()
      server.once('error', () => {
        resolve(false)
      })
      server.once('listening', () => {
        server.close(() => {
          resolve(true)
        })
      })
      server.listen(port, '127.0.0.1')
    })
    if (isFree) {
      return port
    }
    port++
  }
}

async function waitForBackend(
  port: number,
  timeoutMs: number = 5000,
): Promise<void> {
  const startTime = Date.now()
  const url = `${getBackendUrl(port)}/`
  while (true) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        return
      }
    } catch {
      // Ignore connection errors and retry
    }
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for backend to start on port ${port}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

function getBackendDir() {
  let backendDir = path.resolve(__dirname, '../backend')
  if (!fs.existsSync(backendDir)) {
    backendDir = path.resolve(__dirname, '../../backend')
  }
  return backendDir
}

function startBackend(port: number) {
  let binPath: string
  let args: string[]
  let cwdPath: string

  if (app.isPackaged) {
    // In production, the backend-api binary and migrations are placed in the resources directory
    binPath = path.join(process.resourcesPath, 'bin', 'backend-api')
    cwdPath = path.join(process.resourcesPath, 'bin')
    args = []
  } else {
    // In development, spawn bun to run src/index.ts
    binPath = 'bun'
    cwdPath = getBackendDir()
    args = ['run', 'src/index.ts']
  }

  console.log(`Starting Elysia backend on port ${port}. Executable: ${binPath}`)

  const isWindows = process.platform === 'win32'
  backendProcess = spawn(binPath, args, {
    cwd: cwdPath,
    stdio: 'inherit',
    detached: !isWindows, // Run in a new process group on Linux/macOS
    env: {
      ...process.env,
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      PORT: String(port),
    },
  })

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend process:', err)
  })

  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`)
  })
}

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--backend-port=${port}`],
    },
    autoHideMenuBar: true,
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl).catch((err) => {
      console.error('Failed to load URL:', err)
    })
    mainWindow.webContents.openDevTools()
  } else if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('Failed to load URL:', err)
    })
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow
      .loadFile(path.join(process.resourcesPath, 'frontend', 'index.html'))
      .catch((err) => {
        console.error('Failed to load static file:', err)
      })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC Handlers
ipcMain.handle(
  'backend:ping',
  createHandler(async () => {
    try {
      const res = await fetch(`${getBackendUrl(backendPort)}/`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const text = await res.text()
      return `Main Process Response: SUCCESS (Elysia Backend says: "${text}")`
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      throw new AppError(
        'PING_FAILED',
        `Main Process Response: FAILED (Could not connect to Elysia on port ${backendPort}. Error: ${msg})`,
      )
    }
  }),
)

ipcMain.handle(
  'dialog:open',
  createHandler(
    async (options: { mode: 'file' | 'directory'; extension?: string }) => {
      validateObject(options, 'options')
      if (options.mode !== 'file' && options.mode !== 'directory') {
        throw new AppError(
          'INVALID_INPUT',
          "options.mode must be 'file' or 'directory'",
        )
      }
      if (
        options.extension !== undefined &&
        typeof options.extension !== 'string'
      ) {
        throw new AppError(
          'INVALID_INPUT',
          'options.extension must be a string',
        )
      }

      const isFile = options.mode === 'file'
      const properties: ('openFile' | 'openDirectory')[] = isFile
        ? ['openFile']
        : ['openDirectory']

      const result = await dialog.showOpenDialog({
        properties,
        filters:
          isFile && options.extension
            ? [{ name: 'CAD Files', extensions: [options.extension] }]
            : undefined,
      })

      if (!result.canceled && result.filePaths.length > 0) {
        for (const filePath of result.filePaths) {
          const allowedPath =
            options.mode === 'directory' ? filePath : path.dirname(filePath)
          allowedWorkspaceRoots.add(path.resolve(allowedPath))
          console.log(`Added allowed path to sandbox: ${allowedPath}`)
        }
      }

      return {
        canceled: result.canceled,
        filePaths: result.filePaths,
      }
    },
  ),
)

ipcMain.handle(
  'fs:read',
  createHandler(async (filePath: string) => {
    validateString(filePath, 'filePath')
    const validated = validatePath(filePath)
    return await fs.promises.readFile(validated, 'utf-8')
  }),
)

ipcMain.handle(
  'fs:write',
  createHandler(async (filePath: string, content: string) => {
    validateString(filePath, 'filePath')
    if (typeof content !== 'string') {
      throw new AppError('INVALID_INPUT', 'content must be a string')
    }
    const validated = validatePath(filePath)
    await fs.promises.writeFile(validated, content, 'utf-8')
  }),
)

ipcMain.handle(
  'fs:readdir',
  createHandler(async (dirPath: string) => {
    validateString(dirPath, 'dirPath')
    const validated = validatePath(dirPath)
    return await fs.promises.readdir(validated)
  }),
)

ipcMain.handle(
  'fs:readdirWithTypes',
  createHandler(async (dirPath: string) => {
    validateString(dirPath, 'dirPath')
    const validated = validatePath(dirPath)
    const entries = await fs.promises.readdir(validated, {
      withFileTypes: true,
    })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }))
  }),
)

ipcMain.handle(
  'workspace:watch',
  createHandler(async (dirPath: string) => {
    validateString(dirPath, 'dirPath')
    const validated = validatePath(dirPath)

    if (watchedDirPath === validated && dirWatcher) {
      return
    }

    if (dirWatcher) {
      console.log(`Closing directory watcher for: ${watchedDirPath}`)
      await dirWatcher.close()
      dirWatcher = null
    }

    watchedDirPath = validated
    console.log(`Starting directory watcher for: ${validated}`)

    const chokidar = await import('chokidar')
    dirWatcher = chokidar.watch(validated, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
    })

    const sendEvent = (
      type: 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir',
      absolutePath: string,
    ) => {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        const relativePath =
          '/' + path.relative(validated, absolutePath).replace(/\\/g, '/')

        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('file-changed', {
              event: 'fs:watch',
              type,
              path: relativePath,
            })
          }
        }
      }
    }

    dirWatcher
      .on('add', (filePath: string) => sendEvent('add', filePath))
      .on('change', (filePath: string) => sendEvent('change', filePath))
      .on('unlink', (filePath: string) => sendEvent('unlink', filePath))
      .on('addDir', (subDirPath: string) => sendEvent('addDir', subDirPath))
      .on('unlinkDir', (subDirPath: string) =>
        sendEvent('unlinkDir', subDirPath),
      )
      .on('error', (error: unknown) =>
        console.error(`Watcher error: ${String(error)}`),
      )
  }),
)

ipcMain.handle(
  'projects:refresh-roots',
  createHandler(async () => {
    await loadAllowedWorkspaceRoots(backendPort)
    return { count: allowedWorkspaceRoots.size }
  }),
)

ipcMain.handle(
  'projects:add-root',
  createHandler((directory: string) => {
    validateString(directory, 'directory')
    allowedWorkspaceRoots.add(path.resolve(directory))
    console.log(`Added allowed workspace root: ${directory}`)
    return { count: allowedWorkspaceRoots.size }
  }),
)

app.whenReady().then(async () => {
  try {
    backendPort = await findFreePort(3000)
    startBackend(backendPort)
    await waitForBackend(backendPort, 5000)
    await loadAllowedWorkspaceRoots(backendPort)
    createWindow(backendPort)
  } catch (err: any) {
    console.error('Failed during initialization:', err)
    dialog.showErrorBox(
      'Initialization Error',
      `The application failed to start correctly. Details: ${err.message || String(err)}`,
    )
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(backendPort)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  if (dirWatcher) {
    console.log(`Closing directory watcher for: ${watchedDirPath}`)
    dirWatcher.close().catch((err: Error) => console.error(err))
  }
  if (backendProcess) {
    console.log('Killing backend process tree...')
    if (backendProcess.pid && process.platform !== 'win32') {
      try {
        process.kill(-backendProcess.pid, 'SIGKILL') // Kill entire process group
      } catch (_e) {
        backendProcess.kill()
      }
    } else {
      backendProcess.kill()
    }
  }
})

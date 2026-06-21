/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fileURLToPath } from 'node:url'

import { spawn } from 'child_process'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'

import { registerBackendIpc } from './ipc/backend.js'
import { registerDialogIpc } from './ipc/dialog.js'
import { registerFsIpc } from './ipc/fs.js'
import { registerOpenSCADIpc } from './ipc/openscad.js'
import { registerWorkspaceIpc } from './ipc/workspace.js'
import { stopWatcher } from './utils/watcher.js'
import { loadAllowedWorkspaceRoots } from './utils/workspace.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  const url = `http://127.0.0.1:${port}/`
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
    binPath = path.join(process.resourcesPath, 'bin', 'backend-api')
    cwdPath = path.join(process.resourcesPath, 'bin')
    args = []
  } else {
    binPath = 'bun'
    cwdPath = getBackendDir()
    args = ['run', '--watch', 'src/index.ts']
  }

  console.log(`Starting Elysia backend on port ${port}. Executable: ${binPath}`)

  const isWindows = process.platform === 'win32'
  backendProcess = spawn(binPath, args, {
    cwd: cwdPath,
    stdio: 'inherit',
    detached: !isWindows,
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

app.whenReady().then(async () => {
  try {
    backendPort = await findFreePort(3000)
    startBackend(backendPort)
    await waitForBackend(backendPort, 5000)
    await loadAllowedWorkspaceRoots(`http://127.0.0.1:${backendPort}`)
    createWindow(backendPort)

    registerBackendIpc(ipcMain, backendPort)
    registerDialogIpc(ipcMain)
    registerFsIpc(ipcMain)
    registerWorkspaceIpc(ipcMain, backendPort)
    registerOpenSCADIpc(ipcMain)

    // Broadcast performance metrics every second
    setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return

      const metrics = app.getAppMetrics()
      let mainMetrics: { cpu: number; mem: number } | null = null
      let rendererMetrics: { cpu: number; mem: number } | null = null

      for (const proc of metrics) {
        if (proc.type === 'Browser') {
          mainMetrics = {
            cpu: proc.cpu.percentCPUUsage,
            mem: proc.memory.workingSetSize / 1024,
          }
        } else if (proc.type === 'Tab') {
          rendererMetrics = {
            cpu: proc.cpu.percentCPUUsage,
            mem: proc.memory.workingSetSize / 1024,
          }
        }
      }

      mainWindow.webContents.send('perf-metrics', {
        mainMetrics,
        rendererMetrics,
      })
    }, 1000)
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
  stopWatcher().catch(() => {})
  if (backendProcess) {
    console.log('Killing backend process tree...')
    if (backendProcess.pid && process.platform !== 'win32') {
      try {
        process.kill(-backendProcess.pid, 'SIGKILL')
      } catch (_e) {
        backendProcess.kill()
      }
    } else {
      backendProcess.kill()
    }
  }
})

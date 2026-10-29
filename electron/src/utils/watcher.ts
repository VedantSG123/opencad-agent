import * as path from 'path'

import type { FSWatcher } from 'chokidar' with { 'resolution-mode': 'import' }
import { BrowserWindow } from 'electron'

let dirWatcher: FSWatcher | null = null
let watchedDirPath: string | null = null
let generation = 0

export async function startWatching(dirPath: string): Promise<void> {
  if (watchedDirPath === dirPath && dirWatcher) {
    return
  }

  const ownGeneration = ++generation
  const previous = dirWatcher
  dirWatcher = null
  watchedDirPath = dirPath
  if (previous) {
    await previous.close()
  }
  if (ownGeneration !== generation) return
  console.log(`Starting directory watcher for: ${dirPath}`)

  const chokidar = await import('chokidar')
  if (ownGeneration !== generation) return
  const watcher = chokidar.watch(dirPath, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    ignoreInitial: true,
  })
  dirWatcher = watcher

  const sendEvent = (
    type: 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir',
    absolutePath: string,
  ) => {
    if (ownGeneration !== generation || dirWatcher !== watcher) return
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const relativePath =
        '/' + path.relative(dirPath, absolutePath).replace(/\\/g, '/')

      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('file-changed', {
            event: 'fs:watch',
            directory: dirPath,
            type,
            path: relativePath,
          })
        }
      }
    }
  }

  watcher
    .on('add', (filePath: string) => sendEvent('add', filePath))
    .on('change', (filePath: string) => sendEvent('change', filePath))
    .on('unlink', (filePath: string) => sendEvent('unlink', filePath))
    .on('addDir', (subDirPath: string) => sendEvent('addDir', subDirPath))
    .on('unlinkDir', (subDirPath: string) => sendEvent('unlinkDir', subDirPath))
    .on('error', (error: unknown) =>
      console.error(`Watcher error: ${String(error)}`),
    )
}

export async function stopWatcher(): Promise<void> {
  generation++
  const previous = dirWatcher
  dirWatcher = null
  watchedDirPath = null
  if (previous) {
    await previous.close()
  }
}

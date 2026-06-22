import type { FSWatcher } from 'chokidar' with { 'resolution-mode': 'import' }
import { BrowserWindow } from 'electron'
import * as path from 'path'

let dirWatcher: FSWatcher | null = null
let watchedDirPath: string | null = null

export async function startWatching(dirPath: string): Promise<void> {
  if (watchedDirPath === dirPath && dirWatcher) {
    return
  }

  if (dirWatcher) {
    console.log(`Closing directory watcher for: ${watchedDirPath}`)
    await dirWatcher.close()
    dirWatcher = null
  }

  watchedDirPath = dirPath
  console.log(`Starting directory watcher for: ${dirPath}`)

  const chokidar = await import('chokidar')
  dirWatcher = chokidar.watch(dirPath, {
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
        '/' + path.relative(dirPath, absolutePath).replace(/\\/g, '/')

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
    .on('unlinkDir', (subDirPath: string) => sendEvent('unlinkDir', subDirPath))
    .on('error', (error: unknown) =>
      console.error(`Watcher error: ${String(error)}`),
    )
}

export async function stopWatcher(): Promise<void> {
  if (dirWatcher) {
    console.log(`Closing directory watcher for: ${watchedDirPath}`)
    await dirWatcher.close()
    dirWatcher = null
    watchedDirPath = null
  }
}

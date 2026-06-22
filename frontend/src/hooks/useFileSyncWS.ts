import { useCallback, useEffect, useState } from 'react'

import { joinPaths } from '@/lib/utils'

import type { WatchEvent } from '../types/electron'
export type { WatchEvent }

export type FSEventType = 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir'

export interface FSEntry {
  name: string
  isDirectory(): boolean
  isFile(): boolean
}

export class FSNotReadyError extends Error {
  constructor() {
    super('File system is not ready')
    this.name = 'FSNotReadyError'
  }
}

export type FileSyncStatus = 'connecting' | 'ready' | 'error' | 'closed'

export interface FileSyncWS {
  status: FileSyncStatus
  error: string | null
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  readdir: (path: string) => Promise<string[]>
  readdirWithTypes: (path: string) => Promise<FSEntry[]>
  onWatch: (handler: (event: WatchEvent) => void) => () => void
}

export function useFileSyncWS(
  projectId: string,
  projectDirectory: string,
): FileSyncWS {
  const [status, setStatus] = useState<FileSyncStatus>(
    typeof window !== 'undefined' && window.electron ? 'connecting' : 'error',
  )
  const [error, setError] = useState<string | null>(
    typeof window !== 'undefined' && window.electron
      ? null
      : 'Electron environment is not available',
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) {
      return
    }

    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setStatus('connecting')
      }
    })

    window.electron
      .watchDirectory(projectDirectory)
      .then((res) => {
        if (!res.success) {
          throw new Error(res.error.message)
        }
        if (!cancelled) {
          setStatus('ready')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          setError(msg)
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId, projectDirectory])

  const resolvePath = useCallback(
    (virtualPath: string) => {
      return joinPaths(projectDirectory, virtualPath)
    },
    [projectDirectory],
  )

  const readFile = useCallback(
    async (path: string) => {
      if (status !== 'ready') throw new FSNotReadyError()
      if (!window.electron) {
        throw new Error('Electron not available')
      }
      const res = await window.electron.readFile(resolvePath(path))
      if (!res.success) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    [status, resolvePath],
  )

  const writeFile = useCallback(
    async (path: string, content: string) => {
      if (status !== 'ready') throw new FSNotReadyError()
      if (!window.electron) {
        throw new Error('Electron not available')
      }
      const res = await window.electron.writeFile(resolvePath(path), content)
      if (!res.success) {
        throw new Error(res.error.message)
      }
    },
    [status, resolvePath],
  )

  const readdir = useCallback(
    async (path: string) => {
      if (status !== 'ready') throw new FSNotReadyError()
      if (!window.electron) {
        throw new Error('Electron not available')
      }
      const res = await window.electron.readdir(resolvePath(path))
      if (!res.success) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    [status, resolvePath],
  )

  const readdirWithTypes = useCallback(
    async (path: string): Promise<FSEntry[]> => {
      if (status !== 'ready') throw new FSNotReadyError()
      if (!window.electron) {
        throw new Error('Electron not available')
      }
      const res = await window.electron.readdirWithTypes(resolvePath(path))
      if (!res.success) {
        throw new Error(res.error.message)
      }
      return res.data.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDirectory,
        isFile: () => e.isFile,
      }))
    },
    [status, resolvePath],
  )

  const onWatch = useCallback((handler: (event: WatchEvent) => void) => {
    if (!window.electron) return () => {}
    return window.electron.onWatch(handler)
  }, [])

  return {
    status,
    error,
    readFile,
    writeFile,
    readdir,
    readdirWithTypes,
    onWatch,
  }
}

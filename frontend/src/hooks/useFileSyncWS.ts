import { configureSingle, fs, Port } from '@zenfs/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getBaseWsUrl } from '@/utils/getWsBaseUrl'

export type FSEventType = 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir'

export interface WatchEvent {
  event: 'fs:watch'
  type: FSEventType
  path: string
}

export interface FSEntry {
  name: string
  isDirectory(): boolean
  isFile(): boolean
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

export function useFileSyncWS(projectId: string): FileSyncWS {
  const [status, setStatus] = useState<FileSyncStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const watchHandlers = useRef<Set<(event: WatchEvent) => void>>(new Set())

  useEffect(() => {
    let cancelled = false
    const ws = new WebSocket(`${getBaseWsUrl()}/ws/sync?projectId=${projectId}`)

    ws.addEventListener('open', () => {
      configureSingle({ backend: Port, port: ws })
        .then(() => {
          if (cancelled) return
          setStatus('ready')
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setError(err instanceof Error ? err.message : 'Failed to mount FS')
          setStatus('error')
        })
    })

    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      try {
        const msg = JSON.parse(event.data) as Record<string, unknown>
        if (msg.event === 'fs:watch') {
          const watchEvent = msg as unknown as WatchEvent
          watchHandlers.current.forEach((h) => h(watchEvent))
        }
      } catch {
        // binary zenfs RPC message, zenfs handles it
      }
    })

    ws.addEventListener('error', () => {
      if (cancelled) return
      setError('WebSocket connection failed')
      setStatus('error')
    })

    ws.addEventListener('close', () => {
      if (cancelled) return
      setStatus('closed')
    })

    return () => {
      cancelled = true
      ws.close()
    }
  }, [projectId])

  const readFile = useCallback(
    (path: string) => fs.promises.readFile(path, 'utf8'),
    [],
  )

  const writeFile = useCallback(
    (path: string, content: string) =>
      fs.promises.writeFile(path, content, 'utf8'),
    [],
  )

  const readdir = useCallback((path: string) => fs.promises.readdir(path), [])

  const readdirWithTypes = useCallback(
    (path: string) =>
      fs.promises.readdir(path, { withFileTypes: true }) as Promise<FSEntry[]>,
    [],
  )

  const onWatch = useCallback((handler: (event: WatchEvent) => void) => {
    watchHandlers.current.add(handler)
    return () => {
      watchHandlers.current.delete(handler)
    }
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

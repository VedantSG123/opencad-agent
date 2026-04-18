import { configureSingle, fs, Port } from '@zenfs/core'
import { useEffect, useState } from 'react'

import { getBaseWsUrl } from '@/utils/getWsBaseUrl'

type Status = 'connecting' | 'ready' | 'error' | 'closed'

export interface ProjectFSState {
  status: Status
  entries: string[]
  error: string | null
}

export function useProjectFS(projectId: string): ProjectFSState {
  const [status, setStatus] = useState<Status>('connecting')
  const [entries, setEntries] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const ws = new WebSocket(`${getBaseWsUrl()}/ws/sync?projectId=${projectId}`)

    ws.addEventListener('open', () => {
      configureSingle({ backend: Port, port: ws })
        .then(() => fs.promises.readdir('/'))
        .then((result) => {
          if (cancelled) return
          setEntries(result)
          setStatus('ready')
        })
        .catch((err: unknown) => {
          console.log('Failed to mount FS', err)
          if (cancelled) return
          setError(err instanceof Error ? err.message : 'Failed to mount FS')
          setStatus('error')
        })
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

  return { status, entries, error }
}

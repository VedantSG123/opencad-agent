import { useCallback } from 'react'
import { toast } from 'sonner'

import { getBaseApiUrl } from '@/utils/getApiBaseUrl'

import { useSSEStream } from './useSSEStream'

const API_BASE = getBaseApiUrl()

type FileDialogMode = 'file' | 'directory'

interface KeepAliveChunk {
  ts: number
}

interface FileDialogDone {
  path: string | null
  canceled: boolean
}

interface SSEPayload {
  event: string
  ts?: number
  path?: string | null
  canceled?: boolean
  message?: string
}

function parseFileDialogEvent(
  raw: string,
):
  | { type: 'chunk'; data: KeepAliveChunk }
  | { type: 'done'; data: FileDialogDone }
  | { type: 'error'; error: string } {
  const payload = JSON.parse(raw) as SSEPayload

  switch (payload.event) {
    case 'KEEP_ALIVE':
      return { type: 'chunk', data: { ts: payload.ts ?? Date.now() } }

    case 'DONE':
      return {
        type: 'done',
        data: {
          path: payload.path ?? null,
          canceled: payload.canceled ?? false,
        },
      }

    case 'ERROR':
      return {
        type: 'error',
        error: payload.message ?? 'Unknown error from file dialog',
      }

    default:
      return { type: 'chunk', data: { ts: Date.now() } }
  }
}

export function useFileDialog() {
  const { start, stop, isLoading, isStreaming, isError, final } = useSSEStream<
    KeepAliveChunk,
    FileDialogDone
  >()

  const open = useCallback(
    (mode: FileDialogMode, onSuccess: (path: string) => void) => {
      const url = `${API_BASE}/projects/file-dialog?mode=${mode}`

      start({
        url,
        parse: parseFileDialogEvent,
        onDone: (result) => {
          if (result.canceled || !result.path) {
            toast.info('File selection was cancelled')
            return
          }
          onSuccess(result.path)
        },
        onError: (err) => {
          toast.error(err)
        },
      })
    },
    [start],
  )

  return {
    open,
    stop,
    isLoading,
    isStreaming,
    isError,
    isActive: isLoading || isStreaming,
    result: final,
  }
}

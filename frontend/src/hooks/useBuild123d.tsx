import * as React from 'react'

import type { DecodedModel } from '@/kernels/build123d/decode'
import { decodeModel } from '@/kernels/build123d/decode'
import type { LogEntry } from '@/types'

type Build123dState = {
  model: DecodedModel | null
  error: string | null
  logs: LogEntry[]
  isBuilding: boolean
  duration: number | null
}

const INITIAL: Build123dState = {
  model: null,
  error: null,
  logs: [],
  isBuilding: false,
  duration: null,
}

function toLogs(output: string): LogEntry[] {
  const timestamp = Date.now()
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((text) => ({ type: 'log' as const, text, timestamp }))
}

export function useBuild123d() {
  const [state, setState] = React.useState<Build123dState>(INITIAL)

  const buildSource = React.useCallback(async (source: string) => {
    setState((prev) => ({ ...prev, isBuilding: true, error: null }))

    const response = await window.electron?.runBuild123dSource(source)

    if (!response) {
      setState((prev) => ({
        ...prev,
        isBuilding: false,
        error: 'build123d builds need the desktop app.',
      }))
      return
    }

    if (!response.success) {
      setState((prev) => ({
        ...prev,
        isBuilding: false,
        error: response.error.message,
      }))
      return
    }

    const result = response.data
    const logs = toLogs(result.logs)

    if (!result.ok) {
      setState({
        model: null,
        error: result.error,
        logs: [
          ...logs,
          { type: 'error', text: result.error, timestamp: Date.now() },
        ],
        isBuilding: false,
        duration: result.duration,
      })
      return
    }

    setState({
      model: decodeModel(result),
      error: null,
      logs,
      isBuilding: false,
      duration: result.duration,
    })
  }, [])

  const clearLogs = React.useCallback(
    () => setState((prev) => ({ ...prev, logs: [] })),
    [],
  )

  return { ...state, buildSource, clearLogs }
}

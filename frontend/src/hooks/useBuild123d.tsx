import * as React from 'react'
import type { Build123dResult } from 'shared/build123d'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { DecodedModel } from '@/kernels/build123d/decode'
import { decodeModel } from '@/kernels/build123d/decode'
import { inSeries } from '@/kernels/replicad/inSeries'
import type { LogEntry } from '@/types'
import type { Result } from '@/types/electron'

type BuildRequest = {
  mainPath: string
  projectDirectory: string
  overrides?: Record<string, string>
}

type Build123dState = {
  model: DecodedModel | null
  error: string | null
  logs: LogEntry[]
  isBuilding: boolean
  duration: number | null
}

type Build123dActions = {
  build: (request: BuildRequest) => Promise<void>
  buildSource: (source: string) => Promise<void>
  clearLogs: () => void
}

function toLogs(output: string): LogEntry[] {
  const timestamp = Date.now()
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((text) => ({ type: 'log' as const, text, timestamp }))
}

export type Build123dStore = ReturnType<typeof createBuild123dStore>

export function createBuild123dStore() {
  return createStore<Build123dState & Build123dActions>((set) => {
    const apply = (response: Result<Build123dResult> | undefined) => {
      if (!response) {
        set({
          isBuilding: false,
          error: 'build123d builds need the desktop app.',
        })
        return
      }

      if (!response.success) {
        set({ isBuilding: false, error: response.error.message })
        return
      }

      const result = response.data
      const logs = toLogs(result.logs)

      if (!result.ok) {
        set({
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

      set({
        model: decodeModel(result),
        error: null,
        logs,
        isBuilding: false,
        duration: result.duration,
      })
    }

    // Serialised for the same reason the other kernels are: a build that lands
    // after a newer one would overwrite it with a stale model.
    const build = inSeries(async (request: BuildRequest) => {
      set({ isBuilding: true, error: null })
      apply(await window.electron?.runBuild123d(request))
    })

    const buildSource = inSeries(async (source: string) => {
      set({ isBuilding: true, error: null })
      apply(await window.electron?.runBuild123dSource(source))
    })

    return {
      model: null,
      error: null,
      logs: [],
      isBuilding: false,
      duration: null,
      build,
      buildSource,
      clearLogs: () => set({ logs: [] }),
    }
  })
}

const Build123dContext = React.createContext<Build123dStore | null>(null)

export function Build123dProvider({ children }: { children: React.ReactNode }) {
  const [store] = React.useState(createBuild123dStore)

  return (
    <Build123dContext.Provider value={store}>
      {children}
    </Build123dContext.Provider>
  )
}

export function useBuild123d<T>(
  selector: (state: Build123dState & Build123dActions) => T,
): T {
  const store = React.useContext(Build123dContext)

  if (!store) {
    throw new Error('useBuild123d must be used within Build123dProvider')
  }

  return useStore(store, selector)
}

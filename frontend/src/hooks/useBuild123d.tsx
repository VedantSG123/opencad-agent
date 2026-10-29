import * as React from 'react'
import type {
  Build123dProjectRequest,
  Build123dResult,
  Build123dRunIdentity,
} from 'shared/build123d'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { DecodedModel } from '@/kernels/build123d/decode'
import { decodeModel } from '@/kernels/build123d/decode'
import type { LogEntry } from '@/types'
import type { Result } from '@/types/electron'

type BuildRequest = Omit<Build123dProjectRequest, keyof Build123dRunIdentity>

type Build123dState = {
  sessionId: string
  model: DecodedModel | null
  error: string | null
  logs: LogEntry[]
  isBuilding: boolean
  duration: number | null
}

type Build123dActions = {
  build: (request: BuildRequest) => Promise<void>
  buildSource: (source: string) => Promise<void>
  cancel: () => Promise<void>
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
    const sessionId = crypto.randomUUID()
    let generation = 0
    const fail = (message: string) => {
      set((state) => ({
        model: null,
        error: message,
        logs: [
          ...state.logs,
          { type: 'error', text: message, timestamp: Date.now() },
        ],
      }))
    }

    const run = async (
      request: (
        identity: Build123dRunIdentity,
      ) => Promise<Result<Build123dResult>> | undefined,
    ) => {
      const ownGeneration = ++generation
      set({ isBuilding: true, error: null, logs: [], duration: null })
      try {
        const response = await request({
          sessionId,
          runId: crypto.randomUUID(),
        })
        if (ownGeneration !== generation) return
        if (!response) {
          fail('build123d builds need the desktop app.')
          return
        }
        if (!response.success) {
          fail(response.error.message)
          return
        }

        const result = response.data
        set({ logs: toLogs(result.logs), duration: result.duration })
        if (!result.ok) {
          fail(result.error)
          return
        }

        set({ model: decodeModel(result) })
      } catch (error) {
        if (ownGeneration === generation) {
          fail(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (ownGeneration === generation) set({ isBuilding: false })
      }
    }

    const build = (request: BuildRequest) =>
      run((identity) =>
        window.electron?.runBuild123d({ ...request, ...identity }),
      )

    const buildSource = (source: string) =>
      run((identity) =>
        window.electron?.runBuild123dSource({ source, ...identity }),
      )

    const cancel = async () => {
      generation++
      set({ isBuilding: false })
      try {
        await window.electron?.cancelBuild123dRun({ sessionId })
      } catch {
        return
      }
    }

    return {
      sessionId,
      model: null,
      error: null,
      logs: [],
      isBuilding: false,
      duration: null,
      build,
      buildSource,
      cancel,
      clearLogs: () => set({ logs: [] }),
    }
  })
}

const Build123dContext = React.createContext<Build123dStore | null>(null)

export function Build123dProvider({ children }: { children: React.ReactNode }) {
  const [store] = React.useState(createBuild123dStore)

  React.useEffect(
    () => () => {
      void store.getState().cancel()
    },
    [store],
  )

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

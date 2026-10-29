import * as React from 'react'
import type { BuildReport, BuildRequest as AgentBuildRequest } from 'shared'
import type {
  Build123dProjectRequest,
  Build123dResult,
  Build123dRunIdentity,
} from 'shared/build123d'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { AgentBuilderProvider } from '@/hooks/useAgentBuilds'
import { build123dReport } from '@/kernels/build123d/buildReport'
import type { DecodedModel } from '@/kernels/build123d/decode'
import { joinPaths } from '@/lib/utils'
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
  buildForAgent: (request: AgentBuildRequest) => Promise<BuildReport>
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

export function createBuild123dStore(projectDirectory?: string) {
  return createStore<Build123dState & Build123dActions>((set) => {
    const sessionId = crypto.randomUUID()
    let generation = 0
    const agentSessions = new Set<string>()
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
      mainPath?: string,
      runSessionId = sessionId,
    ): Promise<BuildReport> => {
      const ownGeneration = ++generation
      set({ isBuilding: true, error: null, logs: [], duration: null })
      try {
        const response = await request({
          sessionId: runSessionId,
          runId: crypto.randomUUID(),
        })
        if (!response || !response.success) {
          const message = response
            ? response.error.message
            : 'build123d builds need the desktop app.'
          if (ownGeneration === generation) fail(message)
          return { status: 'unavailable', reason: message }
        }

        const result = response.data
        if (ownGeneration === generation) {
          set({ logs: toLogs(result.logs), duration: result.duration })
        }
        const { report, model } = build123dReport(result, mainPath)
        if (ownGeneration === generation) {
          if (report.status === 'failed') fail(report.error.message)
          else set({ model })
        }
        return report
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (ownGeneration === generation) fail(message)
        return { status: 'unavailable', reason: message }
      } finally {
        if (ownGeneration === generation) set({ isBuilding: false })
      }
    }

    const build = async (request: BuildRequest) => {
      await run(
        (identity) =>
          window.electron?.runBuild123d({ ...request, ...identity }),
        request.mainPath,
      )
    }

    const buildSource = async (source: string) => {
      await run((identity) =>
        window.electron?.runBuild123dSource({ source, ...identity }),
      )
    }

    const buildForAgent = async ({
      file,
      source,
      geometrySummary,
    }: AgentBuildRequest): Promise<BuildReport> => {
      if (!projectDirectory)
        return {
          status: 'unavailable',
          reason: 'No project directory is available.',
        }
      const mainPath = joinPaths(projectDirectory, file)
      const agentSessionId = crypto.randomUUID()
      agentSessions.add(agentSessionId)
      try {
        return await run(
          (identity) =>
            window.electron?.runBuild123d({
              ...identity,
              mainPath,
              projectDirectory,
              overrides: { [mainPath]: source },
              ...(geometrySummary === undefined ? {} : { geometrySummary }),
            }),
          mainPath,
          agentSessionId,
        )
      } finally {
        agentSessions.delete(agentSessionId)
      }
    }

    const cancel = async () => {
      generation++
      set({ isBuilding: false })
      try {
        await Promise.all(
          [sessionId, ...agentSessions].map(async (sessionId) => {
            await window.electron?.cancelBuild123dRun({ sessionId })
          }),
        )
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
      buildForAgent,
      cancel,
      clearLogs: () => set({ logs: [] }),
    }
  })
}

const Build123dContext = React.createContext<Build123dStore | null>(null)

export function Build123dProvider({
  children,
  projectDirectory,
}: {
  children: React.ReactNode
  projectDirectory?: string
}) {
  const [store] = React.useState(() => createBuild123dStore(projectDirectory))

  React.useEffect(
    () => () => {
      void store.getState().cancel()
    },
    [store],
  )

  return (
    <Build123dContext.Provider value={store}>
      <AgentBuilderProvider value={store.getState().buildForAgent}>
        {children}
      </AgentBuilderProvider>
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

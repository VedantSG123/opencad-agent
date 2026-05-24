import { create } from 'zustand'

import { getBuilderApi } from '@/kernels/replicad/builderApi'
import { inSeries } from '@/kernels/replicad/inSeries'
import type { MeshRenderOutput, SvgRenderOutput } from '@/types'

export type LogEntry = {
  type: 'log' | 'info' | 'warn' | 'error'
  text: string
  timestamp: number
}

type ReplicadState = {
  code: string
  shapes: (MeshRenderOutput | SvgRenderOutput)[] | null
  error: Error | null
  workerReady: boolean
  logs: LogEntry[]
}

type ReplicadActions = {
  setCode: (code: string) => void
  build: () => Promise<void>
  initWorker: () => Promise<void>
  clearLogs: () => void
}

const DEFAULT_SCRIPT = `
const { draw } = replicad;

const main = () => {
  const baseWidth = 20;
  const height = 100;

  const profile = draw()
    .hLine(baseWidth)
    .smoothSplineTo([baseWidth * 1.5, height * 0.2], {
      endTangent: [0, 1],
    })
    .smoothSplineTo([baseWidth * 0.7, height * 0.7], {
      endTangent: [0, 1],
      startFactor: 3,
    })
    .smoothSplineTo([baseWidth , height], {
      endTangent: [0, 1],
      startFactor: 3,
    })
    .lineTo([0, height])
    .close();

  return profile
    .sketchOnPlane("XZ")
    .revolve()
    .shell(5, (f) => f.containsPoint([0, 0, height]))
    .fillet(1.7, (e) => e.inPlane("XY", height));
};
`

export const useReplicad = create<ReplicadState & ReplicadActions>(
  (set, get) => {
    const builderApi = getBuilderApi()

    const initWorker = async () => {
      try {
        const workerReady = await builderApi.init()
        set({ workerReady })
      } catch (e) {
        console.error('Error initializing replicad worker:', e)
      }
    }

    const build = async () => {
      const { code } = get()
      if (!code) {
        set({ shapes: null, error: null, logs: [] })
        return
      }

      try {
        const result = await builderApi.buildFromCode(code)

        if (!result.error) {
          set({
            shapes: result.shapes,
            error: null,
            logs: result.logs as LogEntry[],
          })
        } else {
          const errorLog: LogEntry = {
            type: 'error',
            text: `${result.message}${result.stack ? `\n${result.stack}` : ''}`,
            timestamp: Date.now(),
          }
          set({
            shapes: null,
            error: new Error(result.message),
            logs: [...result.logs, errorLog] as LogEntry[],
          })
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        const errorLog: LogEntry = {
          type: 'error',
          text: err.message + (err.stack ? `\n${err.stack}` : ''),
          timestamp: Date.now(),
        }
        set({
          shapes: null,
          error: err,
          logs: [errorLog],
        })
      }
    }

    const runBuild = inSeries(build)

    return {
      code: DEFAULT_SCRIPT.trim(),
      workerReady: false,
      shapes: null,
      error: null,
      logs: [],
      setCode: (code: string) => set({ code }),
      build: runBuild,
      initWorker,
      clearLogs: () => set({ logs: [] }),
    }
  },
)

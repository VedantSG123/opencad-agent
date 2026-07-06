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
  isCompiling: boolean
  logs: LogEntry[]
  defaultParams: Record<string, unknown> | null
}

type ReplicadActions = {
  setCode: (code: string) => void
  build: (params?: Record<string, unknown>) => Promise<void>
  initWorker: () => Promise<void>
  clearLogs: () => void
}

const DEFAULT_SCRIPT = `
const { draw } = replicad;

const defaultParams = {
  baseWidth: { value: 20, min: 5, max: 40, step: 1 },
  height: { value: 100, min: 20, max: 150, step: 5 },
  thickness: { value: 5, min: 1, max: 10, step: 0.5 },
  filletRadius: { value: 1.7, min: 0.5, max: 5, step: 0.1 }
};

const main = (replicad, params) => {
  const baseWidth = params.baseWidth;
  const height = params.height;

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
    .shell(params.thickness, (f) => f.containsPoint([0, 0, height]))
    .fillet(params.filletRadius, (e) => e.inPlane("XY", height));
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

    const build = async (params?: Record<string, unknown>) => {
      const { code } = get()
      if (!code) {
        set({ shapes: null, error: null, logs: [], defaultParams: null })
        return
      }

      set({ isCompiling: true })
      try {
        const result = await builderApi.buildFromCode(code, params)

        if (!result.error) {
          set({
            shapes: result.shapes,
            error: null,
            logs: result.logs,
            defaultParams: result.defaultParams || null,
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
            defaultParams: null,
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
          defaultParams: null,
        })
      } finally {
        set({ isCompiling: false })
      }
    }

    const runBuild = inSeries(build)

    return {
      code: DEFAULT_SCRIPT.trim(),
      workerReady: false,
      isCompiling: false,
      shapes: null,
      error: null,
      logs: [],
      defaultParams: null,
      setCode: (code: string) => set({ code }),
      build: runBuild,
      initWorker,
      clearLogs: () => set({ logs: [] }),
    }
  },
)

import * as React from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { kernelFilesStore } from '@/hooks/useKernelFiles'
import { createOpenSCADApi } from '@/kernels/openscad/openscadApi'
import type { CompileResult } from '@/kernels/openscad/OpenSCADWrapper'
import { inSeries } from '@/kernels/replicad/inSeries'

export type LogEntry = {
  type: 'log' | 'info' | 'warn' | 'error'
  text: string
  timestamp: number
}

const ERROR_PATTERNS = [
  /^ERROR:/i,
  /Parser error/i,
  /Syntax error/i,
  /Can't open library/i,
  /Current top level object is empty/i,
]

const WARN_PATTERNS = [/^WARNING:/i]

const INFO_PATTERNS = [
  /Geometries in cache:/i,
  /Geometry cache size in bytes:/i,
  /CGAL Polyhedrons in cache:/i,
  /CGAL cache size in bytes:/i,
  /Total rendering time:/i,
  /Top level object is a 3D object/i,
  /^\s*Convex:/i,
  /^\s*Triangles:/i,
  /Could not initialize localization/i,
]

export function classifyOpenScadLog(text: string, timestamp: number): LogEntry {
  if (ERROR_PATTERNS.some((p) => p.test(text))) {
    return {
      type: 'error',
      text,
      timestamp,
    }
  }

  if (WARN_PATTERNS.some((p) => p.test(text))) {
    return {
      type: 'warn',
      text,
      timestamp,
    }
  }

  if (INFO_PATTERNS.some((p) => p.test(text))) {
    return {
      type: 'info',
      text,
      timestamp,
    }
  }

  return {
    type: 'log',
    text,
    timestamp,
  }
}

type OpenSCADState = {
  result: CompileResult | null
  error: Error | null
  isCompiling: boolean
  isExporting: boolean
  logs: LogEntry[]
}

type OpenSCADActions = {
  compile: (
    main: { path: string; code: string },
    remoteFsUrl?: string,
  ) => Promise<void>
  exportSTL: (
    main: { path: string; code: string },
    remoteFsUrl?: string,
  ) => Promise<CompileResult | null>
  terminate: () => void
  clearLogs: () => void
}

export type OpenSCADStore = ReturnType<typeof createOpenSCADStore>

export function createOpenSCADStore() {
  const api = createOpenSCADApi()

  return createStore<OpenSCADState & OpenSCADActions>((set) => {
    const compileInternal = async (
      main: { path: string; code: string },
      remoteFsUrl?: string,
    ) => {
      set({ isCompiling: true })
      const overrides = kernelFilesStore.getState().files

      try {
        const result = await api.compile(main, overrides, remoteFsUrl)
        const now = Date.now()
        const logs: LogEntry[] = []

        let index = 0
        result.stdout.forEach((text) => {
          text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
              logs.push({
                type: 'log',
                text: line,
                timestamp: now + index++,
              })
            })
        })

        result.stderr.forEach((text) => {
          text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
              logs.push(classifyOpenScadLog(line, now + index++))
            })
        })

        if (result.error) {
          set({
            result,
            error: new Error(result.stderr.join('\n') || 'Compile error'),
            logs,
          })
        } else {
          set({ result, error: null, logs })
        }
      } catch (e) {
        console.log('Compilation failed with error', e)
        const err = e instanceof Error ? e : new Error(String(e))
        const errorLog: LogEntry = {
          type: 'error',
          text: err.message + (err.stack ? `\n${err.stack}` : ''),
          timestamp: Date.now(),
        }
        set({
          result: null,
          error: err,
          logs: [errorLog],
        })
      } finally {
        set({ isCompiling: false })
      }
    }

    const runCompile = inSeries(compileInternal)

    return {
      result: null,
      error: null,
      isCompiling: false,
      isExporting: false,
      logs: [],
      compile: runCompile,
      exportSTL: async (
        main: { path: string; code: string },
        remoteFsUrl?: string,
      ) => {
        set({ isExporting: true })
        const overrides = kernelFilesStore.getState().files
        try {
          const result = await api.exportSTL(main, overrides, remoteFsUrl)
          if (result.error) {
            throw new Error(result.stderr.join('\n') || 'Export error')
          }
          return result
        } finally {
          set({ isExporting: false })
        }
      },
      terminate: () => {
        set({
          result: null,
          error: null,
          isCompiling: false,
          isExporting: false,
          logs: [],
        })
        api.terminate()
      },
      clearLogs: () => set({ logs: [] }),
    }
  })
}

const OpenSCADContext = React.createContext<OpenSCADStore | null>(null)

export function OpenSCADProvider({ children }: { children: React.ReactNode }) {
  const [store] = React.useState(createOpenSCADStore)

  React.useEffect(() => {
    return () => {
      store.getState().terminate()
    }
  }, [store])

  return (
    <OpenSCADContext.Provider value={store}>
      {children}
    </OpenSCADContext.Provider>
  )
}

export function useOpenSCAD<T>(
  selector: (state: OpenSCADState & OpenSCADActions) => T,
): T {
  const store = React.useContext(OpenSCADContext)

  if (!store) {
    throw new Error('useOpenSCAD must be used within OpenSCADProvider')
  }

  return useStore(store, selector)
}

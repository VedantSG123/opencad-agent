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
  markers: EditorMarker[]
}

export type EditorMarker = {
  severity: 'error' | 'warning'
  message: string
  line: number
  file: string
}

export function parseOpenSCADDiagnostics(
  stderrLines: string[],
): EditorMarker[] {
  const markers: EditorMarker[] = []

  for (const line of stderrLines) {
    // 1. ERROR: Parser error in file "filename", line X: message
    let m = /^ERROR: Parser error in file "([^"]+)", line (\d+): (.*)$/i.exec(
      line,
    )
    if (m) {
      const [_, file, lineNum, message] = m
      markers.push({
        severity: 'error',
        message: message.trim(),
        line: Number(lineNum),
        file,
      })
      continue
    }

    // 2. ERROR: Parser error: message in file filename, line X
    m = /^ERROR: Parser error: (.*?) in file ([^",]+), line (\d+)$/i.exec(line)
    if (m) {
      const [_, message, file, lineNum] = m
      markers.push({
        severity: 'error',
        message: message.trim(),
        line: Number(lineNum),
        file,
      })
      continue
    }

    // 3. WARNING: message, in file filename, line X
    m = /^WARNING: (.*?),? in file ([^,]+), line (\d+)\.?/i.exec(line)
    if (m) {
      const [_, message, file, lineNum] = m
      markers.push({
        severity: 'warning',
        message: message.trim(),
        line: Number(lineNum),
        file,
      })
      continue
    }
  }

  return markers
}

type OpenSCADActions = {
  checkSyntax: (
    main: { path: string; code: string },
    remoteFsUrl?: string,
  ) => Promise<void>
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
    const checkSyntaxInternal = async (
      main: { path: string; code: string },
      remoteFsUrl?: string,
    ) => {
      const overrides = kernelFilesStore.getState().files

      try {
        const result = await api.checkSyntax(main, overrides, remoteFsUrl)
        const now = Date.now()
        const logs: LogEntry[] = []
        const stderrLines: string[] = []

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
              stderrLines.push(line)
            })
        })

        const markers = parseOpenSCADDiagnostics(stderrLines)
        set({ logs, markers })
      } catch (e) {
        console.log('Syntax checking failed with error', e)
      }
    }

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
        const stderrLines: string[] = []

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
              stderrLines.push(line)
            })
        })

        const markers = parseOpenSCADDiagnostics(stderrLines)

        if (result.error) {
          set({
            result,
            error: new Error(result.stderr.join('\n') || 'Compile error'),
            logs,
            markers,
          })
        } else {
          set({ result, error: null, logs, markers })
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
          markers: [],
        })
      } finally {
        set({ isCompiling: false })
      }
    }

    const runCheckSyntax = inSeries(checkSyntaxInternal)
    const runCompile = inSeries(compileInternal)

    return {
      result: null,
      error: null,
      isCompiling: false,
      isExporting: false,
      logs: [],
      markers: [],
      checkSyntax: runCheckSyntax,
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
          markers: [],
        })
        api.terminate()
      },
      clearLogs: () => set({ logs: [], markers: [] }),
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

import * as React from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { kernelFilesStore } from '@/hooks/useKernelFiles'
import { createOpenSCADApi } from '@/kernels/openscad/openscadApi'
import type { CompileResult } from '@/kernels/openscad/OpenSCADWrapper'
import { inSeries } from '@/kernels/replicad/inSeries'

type OpenSCADState = {
  result: CompileResult | null
  error: Error | null
  isCompiling: boolean
  isExporting: boolean
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
        if (result.error) {
          set({
            result,
            error: new Error(result.stderr.join('\n') || 'Compile error'),
          })
        } else {
          set({ result, error: null })
        }
      } catch (e) {
        console.log('Compilation failed with error', e)
        set({
          result: null,
          error: e instanceof Error ? e : new Error(String(e)),
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
        })
        api.terminate()
      },
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

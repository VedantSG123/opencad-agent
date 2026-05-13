import { create } from 'zustand'

import { kernelFilesStore } from '@/hooks/useKernelFiles'
import { getOpenSCADApi } from '@/kernels/openscad/openscadApi'
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
}

export const useOpenSCAD = create<OpenSCADState & OpenSCADActions>((set) => {
  const compileInternal = async (
    main: { path: string; code: string },
    remoteFsUrl?: string,
  ) => {
    set({ isCompiling: true })
    const overrides = kernelFilesStore.getState().files

    try {
      const result = await getOpenSCADApi().compile(
        main,
        overrides,
        remoteFsUrl,
      )
      if (result.error) {
        set({
          result,
          error: new Error(result.stderr.join('\n') || 'Compile error'),
        })
      } else {
        set({ result, error: null })
      }
    } catch (e) {
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
        const result = await getOpenSCADApi().exportSTL(
          main,
          overrides,
          remoteFsUrl,
        )
        if (result.error) {
          throw new Error(result.stderr.join('\n') || 'Export error')
        }
        return result
      } finally {
        set({ isExporting: false })
      }
    },
  }
})

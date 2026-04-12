import { create } from 'zustand'

import { getOpenSCADApi } from '@/kernels/openscad/openscadApi'
import type { CompileResult } from '@/kernels/openscad/OpenSCADWrapper'

type OpenSCADState = {
  code: string
  result: CompileResult | null
  error: Error | null
  workerReady: boolean
}

type OpenSCADActions = {
  setCode: (code: string) => void
  compile: () => Promise<void>
  exportSTL: () => Promise<CompileResult | null>
  initWorker: () => Promise<void>
  writeFile: (path: string, content: Uint8Array | string) => Promise<void>
  readFile: (path: string) => Promise<Uint8Array | string | null>
  deleteFile: (path: string) => Promise<void>
  listFiles: () => Promise<string[]>
}

const DEFAULT_SCRIPT = `
// Example OpenSCAD script
difference() {
  cube([20, 20, 20], center = true);
  sphere(r = 12);
}
`

export const useOpenSCAD = create<OpenSCADState & OpenSCADActions>(
  (set, get) => {
    const openscadApi = getOpenSCADApi()

    const initWorker = async () => {
      try {
        const workerReady = await openscadApi.init()
        set({ workerReady })
      } catch (e) {
        console.error('Error initializing OpenSCAD worker:', e)
      }
    }

    const compile = async () => {
      const { code } = get()
      if (!code) {
        set({ result: null, error: null })
        return
      }

      try {
        const result = await openscadApi.compile(code)
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
      }
    }

    const exportSTL = async (): Promise<CompileResult | null> => {
      const { code } = get()
      if (!code) return null

      try {
        return await openscadApi.exportSTL(code)
      } catch (e) {
        set({ error: e instanceof Error ? e : new Error(String(e)) })
        return null
      }
    }

    const writeFile = async (
      path: string,
      content: Uint8Array | string,
    ): Promise<void> => {
      await openscadApi.writeFile(path, content)
    }

    const readFile = async (
      path: string,
    ): Promise<Uint8Array | string | null> => {
      return openscadApi.readFile(path)
    }

    const deleteFile = async (path: string): Promise<void> => {
      await openscadApi.deleteFile(path)
    }

    const listFiles = async (): Promise<string[]> => {
      return openscadApi.listFiles()
    }

    return {
      code: DEFAULT_SCRIPT.trim(),
      workerReady: false,
      result: null,
      error: null,
      setCode: (code: string) => set({ code }),
      compile,
      exportSTL,
      initWorker,
      writeFile,
      readFile,
      deleteFile,
      listFiles,
    }
  },
)

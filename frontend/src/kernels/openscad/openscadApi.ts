import { wrap } from 'comlink'

import OpenSCADWorker from '@/workers/openscad/worker?worker'

import type { CompileResult } from './OpenSCADWrapper'

interface OpenSCADWorkerService {
  compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
  ): Promise<CompileResult>
  exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
  ): Promise<CompileResult>
}

class OpenSCADApi {
  private async runInWorker<T>(
    fn: (api: OpenSCADWorkerService) => Promise<T>,
  ): Promise<T> {
    const worker = new OpenSCADWorker()
    const workerApi = wrap<OpenSCADWorkerService>(worker)

    try {
      return await fn(workerApi)
    } finally {
      worker.terminate()
    }
  }

  /** Compile code and return an STL (or SVG for 2D) blob */
  async compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
  ): Promise<CompileResult> {
    return this.runInWorker((api) => api.compile(main, overrides, remoteFsUrl))
  }

  /** Export code as a binary STL blob */
  async exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
  ): Promise<CompileResult> {
    return this.runInWorker((api) =>
      api.exportSTL(main, overrides, remoteFsUrl),
    )
  }
}

let openscadApiInstance: OpenSCADApi | null = null

export function getOpenSCADApi(): OpenSCADApi {
  if (!openscadApiInstance) {
    openscadApiInstance = new OpenSCADApi()
  }
  return openscadApiInstance
}

export default OpenSCADApi

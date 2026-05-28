import { wrap } from 'comlink'

import OpenSCADWorker from '@/workers/openscad/worker?worker'

import type { CompileResult } from './OpenSCADWrapper'

interface OpenSCADWorkerService {
  compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult>
  exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult>
  checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult>
}

export class OpenSCADApi {
  private worker: Worker | null = null
  private workerApi: OpenSCADWorkerService | null = null

  private getWorkerApi(): OpenSCADWorkerService {
    if (!this.worker || !this.workerApi) {
      this.worker = new OpenSCADWorker()
      this.workerApi = wrap<OpenSCADWorkerService>(this.worker)
    }
    return this.workerApi
  }

  async compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    return this.getWorkerApi().compile(main, overrides, remoteFsUrl, vars)
  }

  async exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    return this.getWorkerApi().exportSTL(main, overrides, remoteFsUrl, vars)
  }

  async checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    return this.getWorkerApi().checkSyntax(main, overrides, remoteFsUrl, vars)
  }

  terminate(): void {
    this.worker?.terminate()
    this.worker = null
    this.workerApi = null
  }
}

export function createOpenSCADApi(): OpenSCADApi {
  return new OpenSCADApi()
}

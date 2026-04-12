import { wrap } from 'comlink'

import OpenSCADWorker from '@/workers/openscad/worker?worker'

import type { CompileResult } from './OpenSCADWrapper'

interface OpenSCADWorkerService {
  init(): Promise<boolean>
  compile(code: string): Promise<CompileResult>
  exportSTL(code: string): Promise<CompileResult>
  writeFile(path: string, content: Uint8Array | string): Promise<void>
  readFile(path: string): Promise<Uint8Array | string | null>
  deleteFile(path: string): Promise<void>
  listFiles(): Promise<string[]>
}

class OpenSCADApi {
  private worker: Worker
  private workerApi: OpenSCADWorkerService

  constructor() {
    this.worker = new OpenSCADWorker()
    this.workerApi = wrap<OpenSCADWorkerService>(this.worker)
  }

  async init(): Promise<boolean> {
    return this.workerApi.init()
  }

  /** Compile code and return an STL (or SVG for 2D) blob */
  async compile(code: string): Promise<CompileResult> {
    return this.workerApi.compile(code)
  }

  /** Export code as a binary STL blob */
  async exportSTL(code: string): Promise<CompileResult> {
    return this.workerApi.exportSTL(code)
  }

  // ---------------------------------------------------------------------------
  // Emscripten FS file management
  // ---------------------------------------------------------------------------

  async writeFile(path: string, content: Uint8Array | string): Promise<void> {
    return this.workerApi.writeFile(path, content)
  }

  async readFile(path: string): Promise<Uint8Array | string | null> {
    return this.workerApi.readFile(path)
  }

  async deleteFile(path: string): Promise<void> {
    return this.workerApi.deleteFile(path)
  }

  async listFiles(): Promise<string[]> {
    return this.workerApi.listFiles()
  }

  terminate(): void {
    this.worker.terminate()
  }
}

let openscadApiInstance: OpenSCADApi | null = null

export function getOpenSCADApi(): OpenSCADApi {
  if (!openscadApiInstance) {
    openscadApiInstance = new OpenSCADApi()
  }
  return openscadApiInstance
}

export function terminateOpenSCADApi(): void {
  if (openscadApiInstance) {
    openscadApiInstance.terminate()
    openscadApiInstance = null
  }
}

export default OpenSCADApi

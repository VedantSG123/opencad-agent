import { wrap } from 'comlink'

import OpenSCADWorker from '@/workers/openscad/worker?worker'

import { resolveProjectDependencies } from './dependencyScanner'
import { LibraryLoader } from './libraryLoader'
import type { CompileResult } from './OpenSCADWrapper'

interface OpenSCADWorkerService {
  compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult>
  exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult>
  checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
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

  private async resolveOverrides(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ): Promise<Record<string, { content: string }>> {
    const finalOverrides = { ...overrides }
    const electron = window.electron
    if (!projectDirectory || !electron) return finalOverrides

    try {
      const loader = new LibraryLoader()
      const dependencyPaths = await resolveProjectDependencies(
        main.code,
        main.path,
        async (p) => {
          if (finalOverrides[p]) return finalOverrides[p].content
          if (loader.isLibraryPath(p)) return null

          try {
            const separator = p.startsWith('/') ? '' : '/'
            const res = await electron.readFile(
              projectDirectory + separator + p,
            )
            if (res.success) {
              return res.data
            }
            return null
          } catch {
            return null
          }
        },
      )

      for (const p of dependencyPaths) {
        const normalizedP = p.startsWith('/') ? p : `/${p}`
        if (
          normalizedP ===
          (main.path.startsWith('/') ? main.path : `/${main.path}`)
        )
          continue
        if (finalOverrides[p]) continue
        if (loader.isLibraryPath(p)) continue

        try {
          const separator = p.startsWith('/') ? '' : '/'
          const res = await electron.readFile(projectDirectory + separator + p)
          if (res.success) {
            finalOverrides[p] = { content: res.data }
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error('Failed to resolve dependencies on main thread:', err)
    }

    return finalOverrides
  }

  async compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const resolvedOverrides = await this.resolveOverrides(
      main,
      overrides,
      projectDirectory,
    )
    return this.getWorkerApi().compile(main, resolvedOverrides, vars)
  }

  async exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const resolvedOverrides = await this.resolveOverrides(
      main,
      overrides,
      projectDirectory,
    )
    return this.getWorkerApi().exportSTL(main, resolvedOverrides, vars)
  }

  async checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ): Promise<CompileResult> {
    const resolvedOverrides = await this.resolveOverrides(
      main,
      overrides,
      projectDirectory,
    )
    return this.getWorkerApi().checkSyntax(main, resolvedOverrides)
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

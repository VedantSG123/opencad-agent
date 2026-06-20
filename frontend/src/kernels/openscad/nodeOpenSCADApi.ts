import type { CompileResult } from './OpenSCADWrapper'

function toCompileResult(data: {
  blob: Uint8Array | null
  format: 'stl' | 'svg' | null
  stdout: string[]
  stderr: string[]
  error: boolean
  parameterSet?: unknown
}): CompileResult {
  let blob: Blob | null = null
  if (data.blob) {
    const mimeType = data.format === 'svg' ? 'image/svg+xml' : 'model/stl'
    blob = new Blob([new Uint8Array(data.blob)], { type: mimeType })
  }
  return {
    blob,
    format: data.format,
    stdout: data.stdout,
    stderr: data.stderr,
    error: data.error,
    parameterSet: data.parameterSet as CompileResult['parameterSet'],
  }
}

export class NodeOpenSCADApi {
  private getElectron() {
    const electron = window.electron
    if (!electron) {
      throw new Error('Electron IPC not available')
    }
    return electron
  }

  private async handleIpc<T>(
    call: () => Promise<
      | { success: true; data: T }
      | { success: false; error: { code: string; message: string } }
    >,
  ): Promise<T> {
    const res = await call()
    if (!res.success) {
      throw new Error(res.error.message || 'OpenSCAD IPC call failed')
    }
    return res.data
  }

  async compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const electron = this.getElectron()
    const data = await this.handleIpc(() =>
      electron.compileOpenSCAD(main, overrides, projectDirectory, vars),
    )
    return toCompileResult(data)
  }

  async exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const electron = this.getElectron()
    const data = await this.handleIpc(() =>
      electron.exportSTLOpenSCAD(main, overrides, projectDirectory, vars),
    )
    return toCompileResult(data)
  }

  async checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ): Promise<CompileResult> {
    const electron = this.getElectron()
    const data = await this.handleIpc(() =>
      electron.checkSyntaxOpenSCAD(main, overrides, projectDirectory),
    )
    return toCompileResult(data)
  }
}

export function createNodeOpenSCADApi(): NodeOpenSCADApi {
  return new NodeOpenSCADApi()
}

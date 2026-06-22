import type { ParameterSet } from '@/features/Project/components/editor/openscad/customizer-types'
import type { OpenSCADRequest } from '@/types/electron'

export interface CompileResult {
  blob: Blob | null
  format: string | null
  stdout: string[]
  stderr: string[]
  error: boolean
  parameterSet?: ParameterSet
}

function toCompileResult(data: {
  blob: Uint8Array | null
  format: string | null
  stdout: string[]
  stderr: string[]
  error: boolean
  parameterSet?: unknown
}): CompileResult {
  let blob: Blob | null = null
  if (data.blob) {
    let mimeType = 'application/octet-stream'
    const fmt = data.format?.toLowerCase()
    if (fmt === 'svg') {
      mimeType = 'image/svg+xml'
    } else if (fmt === 'off') {
      mimeType = 'text/plain'
    } else if (fmt === 'stl') {
      mimeType = 'model/stl'
    }
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

  async execute(request: OpenSCADRequest): Promise<CompileResult> {
    const electron = this.getElectron()
    const data = await this.handleIpc(() => electron.executeOpenSCAD(request))
    return toCompileResult(data)
  }

  async compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    return this.execute({
      action: 'compile',
      main,
      overrides,
      projectDirectory,
      vars,
    })
  }

  async export(
    main: { path: string; code: string },
    format: string,
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    return this.execute({
      action: 'export',
      format,
      main,
      overrides,
      projectDirectory,
      vars,
    })
  }

  async checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ): Promise<CompileResult> {
    return this.execute({
      action: 'checkSyntax',
      main,
      overrides,
      projectDirectory,
    })
  }
}

export function createNodeOpenSCADApi(): NodeOpenSCADApi {
  return new NodeOpenSCADApi()
}

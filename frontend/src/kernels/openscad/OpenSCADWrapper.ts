/**
 * Reference from: https://github.com/seasick/openscad-web-gui/blob/main/src/worker/openSCAD.ts
 */
import type { InitOptions, OpenSCAD } from './library/openscad'
import openscad from './library/openscad.js'
import wasmUrl from './library/openscad.wasm?url'

export interface CompileResult {
  blob: Blob | null
  format: 'stl' | 'svg' | null
  stdout: string[]
  stderr: string[]
  error: boolean
}

export class OpenSCADWrapper {
  /** Files managed by this wrapper, written to the Emscripten FS on each compile */
  private files: Map<string, Uint8Array | string> = new Map()

  private async createInstance(
    stdout: string[],
    stderr: string[],
  ): Promise<OpenSCAD> {
    const options: InitOptions = {
      noInitialRun: true,
      locateFile: (path: string) => {
        if (path === 'openscad.wasm') return wasmUrl
        return path
      },
      print: (text: string) => stdout.push(text),
      printErr: (text: string) => stderr.push(text),
    }

    const instance = await openscad(options)

    for (const [filePath, content] of this.files) {
      this.mkdirForFile(instance, filePath)
      instance.FS.writeFile(filePath, content)
    }

    return instance
  }

  /** Recursively creates parent directories for a file path on the given instance */
  private mkdirForFile(instance: OpenSCAD, filePath: string): void {
    const parts = filePath.split('/').filter(Boolean)
    parts.pop()
    let current = ''
    for (const part of parts) {
      current += '/' + part
      try {
        instance.FS.mkdir(current)
      } catch {
        // directory already exists
      }
    }
  }

  /**
   * Compiles OpenSCAD code and returns an STL blob.
   * Falls back to SVG export if the top-level object is 2D.
   */
  async compile(code: string): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(stdout, stderr)

    instance.FS.writeFile('/input.scad', code)

    instance.callMain([
      '-o',
      '/out.stl',
      '--export-format=binstl',
      '--enable=manifold',
      '--enable=fast-csg',
      '--enable=lazy-union',
      '/input.scad',
    ])

    try {
      instance.FS.stat('/out.stl')
      const output = instance.FS.readFile('/out.stl', { encoding: 'binary' })
      return {
        blob: new Blob([output.slice()], { type: 'model/stl' }),
        format: 'stl',
        stdout,
        stderr,
        error: false,
      }
    } catch {
      // No output file produced — check if it was a 2D geometry
      if (
        stderr.some((line) =>
          line.includes('Current top level object is not a 3D object'),
        )
      ) {
        return this.compileSVG(code)
      }

      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  /** Compiles OpenSCAD code to SVG (for 2D sketches) */
  private async compileSVG(code: string): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(stdout, stderr)

    instance.FS.writeFile('/input.scad', code)

    instance.callMain(['-o', '/out.svg', '--export-format=svg', '/input.scad'])

    try {
      instance.FS.stat('/out.svg')
      const output = instance.FS.readFile('/out.svg', { encoding: 'binary' })
      return {
        blob: new Blob([output.slice()], { type: 'image/svg+xml' }),
        format: 'svg',
        stdout,
        stderr,
        error: false,
      }
    } catch {
      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  /**
   * Exports OpenSCAD code as a binary STL blob.
   * Unlike compile(), this does not fall back to SVG.
   */
  async exportSTL(code: string): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(stdout, stderr)

    instance.FS.writeFile('/input.scad', code)

    instance.callMain([
      '-o',
      '/out.stl',
      '--export-format=binstl',
      '--enable=manifold',
      '--enable=fast-csg',
      '--enable=lazy-union',
      '/input.scad',
    ])

    try {
      instance.FS.stat('/out.stl')
      const output = instance.FS.readFile('/out.stl', { encoding: 'binary' })
      return {
        blob: new Blob([output.slice()], { type: 'model/stl' }),
        format: 'stl',
        stdout,
        stderr,
        error: false,
      }
    } catch {
      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  // ---------------------------------------------------------------------------
  // Emscripten FS file management
  // Files are stored in-memory here and written to each fresh WASM instance.
  // ---------------------------------------------------------------------------

  writeFile(path: string, content: Uint8Array | string): void {
    this.files.set(path, content)
  }

  readFile(path: string): Uint8Array | string | null {
    return this.files.get(path) ?? null
  }

  deleteFile(path: string): void {
    this.files.delete(path)
  }

  listFiles(): string[] {
    return Array.from(this.files.keys())
  }
}

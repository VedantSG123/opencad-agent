import type { ParameterSet } from '@/features/Project/components/editor/openscad/customizer-types'

import { resolveProjectDependencies } from './dependencyScanner'
import type { InitOptions, OpenSCAD } from './library/openscad'
import openscad from './library/openscad.js'
import wasmUrl from './library/openscad.wasm?url'
import { LibraryLoader } from './libraryLoader'

export interface CompileResult {
  blob: Blob | null
  format: 'stl' | 'svg' | null
  stdout: string[]
  stderr: string[]
  error: boolean
  parameterSet?: ParameterSet
}

function formatValue(val: unknown): string {
  if (typeof val === 'string') {
    return `"${val}"`
  } else if (Array.isArray(val)) {
    return `[${val.map(formatValue).join(', ')}]`
  } else {
    return `${String(val)}`
  }
}

export class OpenSCADWrapper {
  private libraryLoader = new LibraryLoader()

  private async createInstance(
    stdout: string[],
    stderr: string[],
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
  ): Promise<OpenSCAD> {
    const options: InitOptions = {
      noInitialRun: true,
      locateFile: (p: string) => {
        if (p === 'openscad.wasm') return wasmUrl
        return p
      },
      print: (text: string) => stdout.push(text),
      printErr: (text: string) => stderr.push(text),
    }

    const instance = await openscad(options)
    await this.setupFS(instance, main, overrides)
    return instance
  }

  private async setupFS(
    instance: OpenSCAD,
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
  ) {
    // Resolve dependencies recursively starting from the main file
    const dependencyPaths = await resolveProjectDependencies(
      main.code,
      main.path,
      async (p) => {
        // 1. Check overrides first
        if (overrides && overrides[p]) return overrides[p].content

        // 2. Check bundled libraries
        return await this.libraryLoader.readFileAsText(p)
      },
    )

    // Copy resolved dependencies to Emscripten FS
    for (const depPath of dependencyPaths) {
      const normalizedDepPath = depPath.startsWith('/')
        ? depPath
        : `/${depPath}`
      const normalizedMainPath = main.path.startsWith('/')
        ? main.path
        : `/${main.path}`

      // Skip the main file, it's handled by the caller
      if (normalizedDepPath === normalizedMainPath) continue

      const content =
        overrides && overrides[depPath]
          ? overrides[depPath].content
          : await this.libraryLoader.readFile(depPath)

      if (content) {
        this.mkdirForFile(instance, normalizedDepPath)
        instance.FS.writeFile(normalizedDepPath, content)
      }
    }
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
  async compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(stdout, stderr, main, overrides)

    // Ensure leading slash for Emscripten FS
    const targetPath = main.path.startsWith('/') ? main.path : `/${main.path}`
    this.mkdirForFile(instance, targetPath)
    instance.FS.writeFile(targetPath, main.code)

    const varArgs = vars
      ? Object.entries(vars).map(([k, v]) => `-D${k}=${formatValue(v)}`)
      : []

    instance.callMain([
      '-o',
      '/out.stl',
      '--export-format=binstl',
      '--enable=manifold',
      '--enable=fast-csg',
      '--enable=lazy-union',
      ...varArgs,
      targetPath,
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
      if (
        stderr.some((line) =>
          line.includes('Current top level object is not a 3D object.'),
        )
      ) {
        return this.compileSVG(main, overrides, stdout, stderr, vars)
      }

      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  private async compileSVG(
    main: { path: string; code: string },
    overrides: Record<string, { content: string }> | undefined,
    stdout: string[],
    stderr: string[],
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const svgInstance = await this.createInstance(
      stdout,
      stderr,
      main,
      overrides,
    )

    const targetPath = main.path.startsWith('/') ? main.path : `/${main.path}`
    this.mkdirForFile(svgInstance, targetPath)
    svgInstance.FS.writeFile(targetPath, main.code)

    const varArgs = vars
      ? Object.entries(vars).map(([k, v]) => `-D${k}=${formatValue(v)}`)
      : []

    svgInstance.callMain([
      '-o',
      '/out.svg',
      '--export-format=svg',
      ...varArgs,
      targetPath,
    ])

    try {
      svgInstance.FS.stat('/out.svg')
      const output = svgInstance.FS.readFile('/out.svg', { encoding: 'binary' })
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
  async exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(stdout, stderr, main, overrides)

    const targetPath = main.path.startsWith('/') ? main.path : `/${main.path}`
    this.mkdirForFile(instance, targetPath)
    instance.FS.writeFile(targetPath, main.code)

    const varArgs = vars
      ? Object.entries(vars).map(([k, v]) => `-D${k}=${formatValue(v)}`)
      : []

    instance.callMain([
      '-o',
      '/out.stl',
      '--export-format=binstl',
      '--enable=manifold',
      '--enable=fast-csg',
      '--enable=lazy-union',
      ...varArgs,
      targetPath,
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

  /**
   * Checks syntax of OpenSCAD code without generating geometry.
   */
  async checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(stdout, stderr, main, overrides)

    const targetPath = main.path.startsWith('/') ? main.path : `/${main.path}`
    this.mkdirForFile(instance, targetPath)
    instance.FS.writeFile(targetPath, main.code)

    instance.callMain(['-o', '/out.json', '--export-format=param', targetPath])

    const error = stderr.some((line) => line.includes('ERROR:'))

    let parameterSet: ParameterSet | undefined = undefined
    try {
      instance.FS.stat('/out.json')
      const output = instance.FS.readFile('/out.json', { encoding: 'binary' })
      const decoded = new TextDecoder().decode(output)
      parameterSet = JSON.parse(decoded) as ParameterSet
    } catch {
      // Might not be written if syntax errors exist
    }

    return {
      blob: null,
      format: null,
      stdout,
      stderr,
      error,
      parameterSet,
    }
  }
}

import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'

import type { OpenSCAD } from '../../lib/openscad/openscad.js'
import openscad from '../../lib/openscad/openscad.js'
import { resolveProjectDependencies } from './dependencyScanner.js'
import { LibraryLoader } from './libraryLoader.js'

export interface ParameterOption {
  name: string
  value: number | string
}

export interface BaseParameter {
  caption: string
  group: string
  name: string
  type: 'number' | 'string' | 'boolean'
}

export type NumberParameter = BaseParameter & {
  type: 'number'
  initial: number
  min?: number
  max?: number
  step?: number
  options?: ParameterOption[]
}

export type StringParameter = BaseParameter & {
  type: 'string'
  initial: string
  options?: ParameterOption[]
}

export type BooleanParameter = BaseParameter & {
  type: 'boolean'
  initial: boolean
}

export type VectorParameter = BaseParameter & {
  type: 'number'
  initial: number[]
  min: number
  max: number
  step: number
}

export type Parameter =
  | NumberParameter
  | StringParameter
  | BooleanParameter
  | VectorParameter

export interface ParameterSet {
  parameters: Parameter[]
  title: string
}

export interface CompileResult {
  blob: Uint8Array | null
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
  private libraryLoader: LibraryLoader
  private openscadResourcesPath: string

  constructor(openscadResourcesPath: string) {
    this.openscadResourcesPath = openscadResourcesPath
    this.libraryLoader = new LibraryLoader(openscadResourcesPath)
  }

  private async createInstance(
    stdout: string[],
    stderr: string[],
    main: { path: string; code: string },
    projectDirectory?: string,
    overrides?: Record<string, { content: string }>,
  ): Promise<OpenSCAD> {
    const wasmPath = path.join(this.openscadResourcesPath, 'openscad.wasm')

    const options = {
      noInitialRun: true,
      wasmBinary: await fsPromises.readFile(wasmPath),
      locateFile: (p: string) => {
        if (p === 'openscad.wasm') return wasmPath
        return p
      },
      print: (text: string) => stdout.push(text),
      printErr: (text: string) => stderr.push(text),
    }

    const instance = await openscad(options)
    await this.setupFS(instance, main, projectDirectory, overrides)
    await this.setupFonts(instance)
    return instance
  }

  private async setupFS(
    instance: OpenSCAD,
    main: { path: string; code: string },
    projectDirectory?: string,
    overrides?: Record<string, { content: string }>,
  ) {
    const dependencyPaths = await resolveProjectDependencies(
      main.code,
      main.path,
      async (p: string) => {
        if (overrides && overrides[p]) return overrides[p].content
        if (this.libraryLoader.isLibraryPath(p)) {
          return await this.libraryLoader.readFileAsText(p)
        }
        if (projectDirectory) {
          try {
            const resolvedPath = path.join(projectDirectory, p)
            return await fsPromises.readFile(resolvedPath, 'utf-8')
          } catch {
            // Not found
          }
        }
        return null
      },
    )

    for (const depPath of dependencyPaths) {
      const normalizedDepPath = depPath.startsWith('/')
        ? depPath
        : `/${depPath}`
      const normalizedMainPath = main.path.startsWith('/')
        ? main.path
        : `/${main.path}`

      if (normalizedDepPath === normalizedMainPath) continue

      let content: string | Uint8Array | null = null
      if (overrides && overrides[depPath]) {
        content = overrides[depPath].content
      } else if (this.libraryLoader.isLibraryPath(depPath)) {
        content = await this.libraryLoader.readFile(depPath)
      } else if (projectDirectory) {
        try {
          const resolvedPath = path.join(projectDirectory, depPath)
          content = await fsPromises.readFile(resolvedPath)
        } catch {
          // Ignore
        }
      }

      if (content) {
        this.mkdirForFile(instance, normalizedDepPath)
        instance.FS.writeFile(normalizedDepPath, content)
      }
    }
  }

  private ensureDirectories(instance: OpenSCAD, dirs: string[]) {
    for (const dir of dirs) {
      try {
        instance.FS.mkdir(dir)
      } catch {
        // already exists
      }
    }
  }

  private async setupFonts(instance: OpenSCAD) {
    try {
      await this.libraryLoader.ensureMounted('fonts')

      // OpenSCAD expects these paths in Emscripten FS for font rendering,
      // geometry caching, and fontconfig initialization
      this.ensureDirectories(instance, [
        '/fonts',
        '/cachedir',
        '/etc',
        '/etc/fonts',
      ])

      const { fs: zenFs } = await import('@zenfs/core')
      const files = await zenFs.promises.readdir('/libraries/fonts')
      for (const file of files) {
        const filePath = `/libraries/fonts/${file}`
        const stat = await zenFs.promises.stat(filePath)
        if (stat.isFile()) {
          const content = await zenFs.promises.readFile(filePath)
          instance.FS.writeFile(`/fonts/${file}`, content)
          if (file === 'fonts.conf') {
            instance.FS.writeFile(`/etc/fonts/fonts.conf`, content)
          }
        }
      }
    } catch (err) {
      console.error(
        '[OpenSCADWrapper] Failed to setup fonts in Emscripten FS:',
        err,
      )
    }
  }

  private mkdirForFile(instance: OpenSCAD, filePath: string): void {
    const parts = filePath.split('/').filter(Boolean)
    parts.pop()
    let current = ''
    for (const part of parts) {
      current += '/' + part
      try {
        instance.FS.mkdir(current)
      } catch {
        // already exists
      }
    }
  }

  async compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(
      stdout,
      stderr,
      main,
      projectDirectory,
      overrides,
    )

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
        blob: output.slice(),
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
        return this.compileSVG(
          main,
          overrides,
          projectDirectory,
          stdout,
          stderr,
          vars,
        )
      }
      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  private async compileSVG(
    main: { path: string; code: string },
    overrides: Record<string, { content: string }> | undefined,
    projectDirectory: string | undefined,
    stdout: string[],
    stderr: string[],
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const svgInstance = await this.createInstance(
      stdout,
      stderr,
      main,
      projectDirectory,
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
        blob: output.slice(),
        format: 'svg',
        stdout,
        stderr,
        error: false,
      }
    } catch {
      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  async exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(
      stdout,
      stderr,
      main,
      projectDirectory,
      overrides,
    )

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
        blob: output.slice(),
        format: 'stl',
        stdout,
        stderr,
        error: false,
      }
    } catch {
      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  async checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(
      stdout,
      stderr,
      main,
      projectDirectory,
      overrides,
    )

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

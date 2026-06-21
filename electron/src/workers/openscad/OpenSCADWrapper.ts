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
  format: string | null
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
        if (projectDirectory) {
          try {
            const resolvedPath = path.join(projectDirectory, p)
            return await fsPromises.readFile(resolvedPath, 'utf-8')
          } catch {
            // Not found
          }
        }
        if (this.libraryLoader.isLibraryPath(p)) {
          return await this.libraryLoader.readFileAsText(p)
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

      // Skip the main file, it's handled by the caller
      if (normalizedDepPath === normalizedMainPath) continue

      let content: string | Uint8Array | null = null

      // Priority: Overrides > project files > Bundled libraries
      if (overrides && overrides[depPath]) {
        content = overrides[depPath].content
      } else if (projectDirectory) {
        try {
          const resolvedPath = path.join(projectDirectory, depPath)
          content = await fsPromises.readFile(resolvedPath)
        } catch {
          /* not in project — fall through to libraries */
        }
      }

      if (content === null) {
        content = await this.libraryLoader.readFile(depPath)
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

  async execute(request: {
    action: 'compile' | 'export' | 'checkSyntax'
    main: { path: string; code: string }
    overrides?: Record<string, { content: string }>
    projectDirectory?: string
    vars?: Record<string, unknown>
    format?: string
  }): Promise<CompileResult> {
    const { action, main, overrides, projectDirectory, vars, format } = request
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

    if (action === 'checkSyntax') {
      const outPath = '/out.json'
      const args = ['-o', outPath, '--export-format=param', targetPath]
      try {
        instance.callMain(args)
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        stderr.push(errMsg)
        return {
          blob: null,
          format: null,
          stdout,
          stderr,
          error: true,
          parameterSet: undefined,
        }
      }

      const error = stderr.some((line) => line.includes('ERROR:'))
      let parameterSet: ParameterSet | undefined = undefined
      try {
        instance.FS.stat(outPath)
        const output = instance.FS.readFile(outPath, { encoding: 'binary' })
        const decoded = new TextDecoder().decode(output)
        parameterSet = JSON.parse(decoded) as ParameterSet
      } catch {
        // Ignored or failed
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

    if (action === 'compile') {
      const outPath = '/out.off'
      const args = [
        '-o',
        outPath,
        '--export-format=off',
        '--backend=manifold',
        '--enable=lazy-union',
        ...varArgs,
        targetPath,
      ]

      try {
        instance.callMain(args)
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        stderr.push(errMsg)
        return { blob: null, format: null, stdout, stderr, error: true }
      }

      try {
        instance.FS.stat(outPath)
        const output = instance.FS.readFile(outPath, { encoding: 'binary' })
        return {
          blob: output.slice(),
          format: 'off',
          stdout,
          stderr,
          error: false,
        }
      } catch (err: unknown) {
        if (
          stderr.some((line) =>
            line.includes('Current top level object is not a 3D object.'),
          )
        ) {
          // Retry compiling as SVG on the existing instance (libs/fonts are already loaded)
          try {
            instance.callMain([
              '-o',
              '/out.svg',
              '--export-format=svg',
              ...varArgs,
              targetPath,
            ])
            instance.FS.stat('/out.svg')
            const output = instance.FS.readFile('/out.svg', {
              encoding: 'binary',
            })
            return {
              blob: output.slice(),
              format: 'svg',
              stdout,
              stderr,
              error: false,
            }
          } catch (svgErr: unknown) {
            const svgErrMsg =
              svgErr instanceof Error ? svgErr.message : String(svgErr)
            stderr.push(svgErrMsg)
            return { blob: null, format: null, stdout, stderr, error: true }
          }
        }
        const errMsg = err instanceof Error ? err.message : String(err)
        stderr.push(errMsg)
        return { blob: null, format: null, stdout, stderr, error: true }
      }
    }

    if (action === 'export') {
      const exportFormat = format || 'binstl'
      const normalizedFormat = exportFormat.toLowerCase()
      const openSCADFormat =
        normalizedFormat === 'stl' ? 'binstl' : normalizedFormat
      const fileExt = normalizedFormat === 'binstl' ? 'stl' : normalizedFormat

      const outPath = `/out.${fileExt}`

      try {
        instance.callMain([
          '-o',
          outPath,
          `--export-format=${openSCADFormat}`,
          '--backend=manifold',
          '--enable=lazy-union',
          ...varArgs,
          targetPath,
        ])
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        stderr.push(errMsg)
        return { blob: null, format: null, stdout, stderr, error: true }
      }

      try {
        instance.FS.stat(outPath)
        const output = instance.FS.readFile(outPath, { encoding: 'binary' })
        return {
          blob: output.slice(),
          format: fileExt,
          stdout,
          stderr,
          error: false,
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        stderr.push(errMsg)
        return { blob: null, format: null, stdout, stderr, error: true }
      }
    }

    throw new Error(`Unknown action: ${action as string}`)
  }
}

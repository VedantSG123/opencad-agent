import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'

import type { BuildReport, GeometrySummary, OpenSCADBuildRequest } from 'shared'

import { AppError } from '../../ipc-utils.js'
import { openSCADBuildReport, remapOpenSCADDiagnostic } from './diagnostics.js'
import {
  summarizeDrawing,
  summarizeOff,
  summarizeOpenSCAD,
} from './geometrySummary.js'

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
  geometry?: GeometrySummary
}

export type OpenSCADExecutionOptions = {
  agentBuild?: boolean
  signal?: AbortSignal
  geometrySummary?: boolean
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

function openscadBinaryPath(resourcesPath: string): string {
  const binDir = path.join(resourcesPath, 'bin')
  if (process.platform === 'win32') return path.join(binDir, 'openscad.exe')
  if (process.platform === 'linux') {
    return path.join(binDir, 'OpenSCAD.AppDir', 'usr', 'bin', 'openscad')
  }
  return path.join(binDir, 'openscad')
}

async function runOpenSCAD(
  binaryPath: string,
  args: string[],
  env?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ stdout: string[]; stderr: string[]; exitCode: number }> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const proc = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      signal,
      killSignal: 'SIGKILL',
    })

    proc.stdout.on('data', (data: Buffer) => {
      stdout.push(data)
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr.push(data)
    })

    let processError: Error | undefined
    proc.on('close', (exitCode) => {
      if (signal?.aborted) {
        const reason: unknown = signal.reason
        reject(
          reason instanceof Error
            ? reason
            : new Error('The OpenSCAD build was cancelled.'),
        )
        return
      }
      if (processError) {
        reject(processError)
        return
      }
      resolve({
        stdout: Buffer.concat(stdout)
          .toString('utf8')
          .split(/\r?\n/)
          .filter(Boolean),
        stderr: Buffer.concat(stderr)
          .toString('utf8')
          .split(/\r?\n/)
          .filter(Boolean),
        exitCode: exitCode ?? -1,
      })
    })

    proc.on('error', (error) => {
      processError = error
    })
  })
}

export class OpenSCADWrapper {
  private openscadResourcesPath: string
  private userDataPath: string

  constructor(openscadResourcesPath: string, userDataPath: string) {
    this.openscadResourcesPath = openscadResourcesPath
    this.userDataPath = userDataPath
  }

  private async mirrorDirectory(
    srcDir: string,
    destDir: string,
    overrides: Record<string, { content: string }>,
    signal?: AbortSignal,
  ): Promise<void> {
    const walk = async (currentSrc: string, currentDest: string) => {
      signal?.throwIfAborted()
      const entries = await fsPromises.readdir(currentSrc, {
        withFileTypes: true,
      })
      for (const entry of entries) {
        signal?.throwIfAborted()
        const srcPath = path.join(currentSrc, entry.name)
        const destPath = path.join(currentDest, entry.name)
        const relPath = path.relative(srcDir, srcPath)
        const virtualPath = '/' + relPath.replace(/\\/g, '/')

        if (entry.isDirectory()) {
          await fsPromises.mkdir(destPath, { recursive: true })
          await walk(srcPath, destPath)
        } else if (entry.isFile()) {
          // If the file is overridden, skip copying/symlinking here.
          // It will be written in the main overrides block later.
          if (overrides && overrides[virtualPath]) {
            continue
          }
          try {
            await fsPromises.symlink(srcPath, destPath)
          } catch {
            try {
              await fsPromises.copyFile(srcPath, destPath)
            } catch (err) {
              console.error(
                `Failed to copy fallback file: ${srcPath} -> ${destPath}`,
                err,
              )
            }
          }
        }
      }
    }
    await fsPromises.mkdir(destDir, { recursive: true })
    await walk(srcDir, destDir)
  }

  async buildForAgent(
    request: OpenSCADBuildRequest,
    signal?: AbortSignal,
  ): Promise<BuildReport> {
    const started = performance.now()
    const controller = new AbortController()
    const timer = setTimeout(
      () =>
        controller.abort(
          new AppError('BUILD_TIMEOUT', 'OpenSCAD build exceeded 110 seconds.'),
        ),
      110_000,
    )
    timer.unref()
    try {
      const result = await this.execute(
        {
          action: 'compile',
          main: { path: '/' + request.file, code: request.source },
          overrides: { ['/' + request.file]: { content: request.source } },
          projectDirectory: request.projectDirectory,
        },
        {
          signal: signal
            ? AbortSignal.any([controller.signal, signal])
            : controller.signal,
          geometrySummary: request.geometrySummary,
          agentBuild: true,
        },
      )
      return openSCADBuildReport(result, request, performance.now() - started)
    } catch (error) {
      return {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async execute(
    request: {
      action: 'compile' | 'export' | 'checkSyntax'
      main: { path: string; code: string }
      overrides?: Record<string, { content: string }>
      projectDirectory?: string
      vars?: Record<string, unknown>
      format?: string
    },
    options: OpenSCADExecutionOptions = {},
  ): Promise<CompileResult> {
    options.signal?.throwIfAborted()
    const { action, main, overrides, projectDirectory, vars, format } = request

    const binaryPath = openscadBinaryPath(this.openscadResourcesPath)

    if (!fs.existsSync(binaryPath)) {
      throw new AppError(
        'OPENSCAD_NOT_FOUND',
        `OpenSCAD native binary not found at: ${binaryPath}. Please run setup.`,
      )
    }

    // Resolve libraries directory path
    const libsDir = path.join(this.openscadResourcesPath, 'libraries')
    const fontsDir = path.join(this.openscadResourcesPath, 'fonts')
    const spawnEnv: Record<string, string> = {
      OPENSCADPATH: libsDir,
    }

    if (fs.existsSync(fontsDir)) {
      spawnEnv.OPENSCAD_FONT_PATH = fontsDir
    }

    // Mirror folder resolution (if overrides exist, or if we have no projectDirectory)
    let runDir = projectDirectory ?? ''
    let mainFilePath: string
    let isTemp = false

    try {
      const hasOverrides = overrides && Object.keys(overrides).length > 0

      if (hasOverrides || !projectDirectory) {
        isTemp = true
        runDir = path.join(
          this.userDataPath,
          'temp',
          `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        )
        await fsPromises.mkdir(runDir, { recursive: true })

        if (projectDirectory) {
          await this.mirrorDirectory(
            projectDirectory,
            runDir,
            overrides || {},
            options.signal,
          )
        }

        if (overrides) {
          for (const [vPath, entry] of Object.entries(overrides)) {
            const rel = vPath.startsWith('/') ? vPath.slice(1) : vPath
            const dest = path.join(runDir, rel)
            await fsPromises.mkdir(path.dirname(dest), { recursive: true })
            await fsPromises.rm(dest, { force: true })
            await fsPromises.writeFile(dest, entry.content, 'utf8')
          }
        }

        const mainRel = main.path.startsWith('/')
          ? main.path.slice(1)
          : main.path
        mainFilePath = path.join(runDir, mainRel)
        await fsPromises.mkdir(path.dirname(mainFilePath), { recursive: true })
        await fsPromises.rm(mainFilePath, { force: true })
        await fsPromises.writeFile(mainFilePath, main.code, 'utf8')
      } else {
        runDir = projectDirectory
        const mainRel = main.path.startsWith('/')
          ? main.path.slice(1)
          : main.path
        mainFilePath = path.join(projectDirectory, mainRel)
      }

      const run = async (args: string[]) => {
        const result = await runOpenSCAD(
          binaryPath,
          args,
          spawnEnv,
          options.signal,
        )
        if (!options.agentBuild) return result
        return {
          ...result,
          stdout: result.stdout.map((line) =>
            remapOpenSCADDiagnostic(line, runDir, mainFilePath),
          ),
          stderr: result.stderr.map((line) =>
            remapOpenSCADDiagnostic(line, runDir, mainFilePath),
          ),
        }
      }

      const varArgs = vars
        ? Object.entries(vars).map(([k, v]) => `-D${k}=${formatValue(v)}`)
        : []

      options.signal?.throwIfAborted()
      const outputDirectory = options.agentBuild
        ? await fsPromises.mkdtemp(path.join(runDir, '.opencad-output-'))
        : runDir
      const summaryPath = path.join(outputDirectory, 'summary.json')
      const summaryArgs = options.geometrySummary
        ? [
            '--summary=geometry',
            '--summary=bounding-box',
            '--summary-file',
            summaryPath,
          ]
        : []
      if (action === 'checkSyntax') {
        const outPath = path.join(outputDirectory, 'out.json')
        const args = [
          '-o',
          outPath,
          '--export-format=param',
          ...varArgs,
          mainFilePath,
        ]

        const { stdout, stderr, exitCode } = await run(args)
        const error =
          exitCode !== 0 ||
          stderr.some((line) => /^ERROR:/i.test(line.trimStart()))

        let parameterSet: ParameterSet | undefined = undefined
        try {
          if (fs.existsSync(outPath)) {
            const content = await fsPromises.readFile(outPath, 'utf8')
            parameterSet = JSON.parse(content) as ParameterSet
          }
        } catch (err) {
          console.error(
            '[OpenSCADWrapper] Failed to parse parameters JSON:',
            err,
          )
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
        const outPath = path.join(outputDirectory, 'out.off')
        const args = [
          '-o',
          outPath,
          '--export-format=off',
          '--backend=manifold',
          '--enable=lazy-union',
          ...summaryArgs,
          ...varArgs,
          mainFilePath,
        ]

        const { stdout, stderr, exitCode } = await run(args)
        const error =
          exitCode !== 0 ||
          stderr.some((line) => /^ERROR:/i.test(line.trimStart()))

        // Check if output file was created and read it
        if (!error && fs.existsSync(outPath)) {
          const blob = await fsPromises.readFile(outPath)
          return {
            blob: new Uint8Array(blob),
            format: 'off',
            ...(options.geometrySummary
              ? {
                  geometry: summarizeOpenSCAD(main.path.slice(1), () =>
                    summarizeOff(blob.toString('utf8'), main.path.slice(1)),
                  ),
                }
              : {}),
            stdout,
            stderr,
            error: false,
          }
        }

        // Retry compiling as SVG if it failed due to a 2D only layout
        if (
          stderr.some((line) =>
            line.includes('Current top level object is not a 3D object.'),
          )
        ) {
          const svgOutPath = path.join(outputDirectory, 'out.svg')
          const svgArgs = [
            '-o',
            svgOutPath,
            '--export-format=svg',
            ...summaryArgs,
            ...varArgs,
            mainFilePath,
          ]

          const svgRes = await run(svgArgs)
          const svgError =
            svgRes.exitCode !== 0 ||
            svgRes.stderr.some((line) => /^ERROR:/i.test(line.trimStart()))

          stdout.push(...svgRes.stdout)
          stderr.push(...svgRes.stderr)

          if (!svgError && fs.existsSync(svgOutPath)) {
            const blob = await fsPromises.readFile(svgOutPath)
            return {
              blob: new Uint8Array(blob),
              format: 'svg',
              ...(options.geometrySummary
                ? {
                    geometry: summarizeOpenSCAD(main.path.slice(1), () =>
                      summarizeDrawing(
                        JSON.parse(fs.readFileSync(summaryPath, 'utf8')),
                        main.path.slice(1),
                      ),
                    ),
                  }
                : {}),
              stdout,
              stderr,
              error: false,
            }
          }
        }

        return {
          blob: null,
          format: null,
          stdout,
          stderr,
          error: true,
        }
      }

      if (action === 'export') {
        const exportFormat = format || 'binstl'
        const normalizedFormat = exportFormat.toLowerCase()

        let openSCADFormat = normalizedFormat
        let fileExt = normalizedFormat

        if (
          normalizedFormat === 'binstl' ||
          normalizedFormat === 'stl-binary' ||
          normalizedFormat === 'stl'
        ) {
          openSCADFormat = 'binstl'
          fileExt = 'stl'
        } else if (
          normalizedFormat === 'asciistl' ||
          normalizedFormat === 'stl-ascii'
        ) {
          openSCADFormat = 'asciistl'
          fileExt = 'stl'
        }

        const outPath = path.join(outputDirectory, `out.${fileExt}`)

        const args = [
          '-o',
          outPath,
          `--export-format=${openSCADFormat}`,
          '--backend=manifold',
          '--enable=lazy-union',
          ...summaryArgs,
          ...varArgs,
          mainFilePath,
        ]

        const { stdout, stderr, exitCode } = await run(args)
        const error =
          exitCode !== 0 ||
          stderr.some((line) => /^ERROR:/i.test(line.trimStart()))

        if (!error && fs.existsSync(outPath)) {
          const blob = await fsPromises.readFile(outPath)
          return {
            blob: new Uint8Array(blob),
            format: fileExt,
            stdout,
            stderr,
            error: false,
          }
        }

        return {
          blob: null,
          format: null,
          stdout,
          stderr,
          error: true,
        }
      }

      throw new Error(`Unknown action: ${action as string}`)
    } finally {
      if (isTemp) {
        await fsPromises
          .rm(runDir, { recursive: true, force: true })
          .catch((err) => {
            console.error(
              '[OpenSCADWrapper] Failed to clean up temp run folder:',
              err,
            )
          })
      }
    }
  }
}

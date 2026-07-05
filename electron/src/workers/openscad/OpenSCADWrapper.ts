import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'

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

async function runOpenSCAD(
  binaryPath: string,
  args: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string[]; stderr: string[]; exitCode: number }> {
  return new Promise((resolve) => {
    const stdout: string[] = []
    const stderr: string[] = []
    const proc = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })

    proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      stdout.push(...lines)
    })

    proc.stderr.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      stderr.push(...lines)
    })

    proc.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? -1,
      })
    })

    proc.on('error', (err) => {
      resolve({
        stdout,
        stderr: [...stderr, `Process error: ${err.message}`],
        exitCode: -1,
      })
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
  ): Promise<void> {
    const walk = async (currentSrc: string, currentDest: string) => {
      const entries = await fsPromises.readdir(currentSrc, {
        withFileTypes: true,
      })
      for (const entry of entries) {
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

  async execute(request: {
    action: 'compile' | 'export' | 'checkSyntax'
    main: { path: string; code: string }
    overrides?: Record<string, { content: string }>
    projectDirectory?: string
    vars?: Record<string, unknown>
    format?: string
  }): Promise<CompileResult> {
    const { action, main, overrides, projectDirectory, vars, format } = request

    // Resolve native OpenSCAD binary path
    const ext = process.platform === 'win32' ? '.exe' : ''
    const binaryPath = path.join(
      this.openscadResourcesPath,
      'bin',
      `openscad${ext}`,
    )

    if (!fs.existsSync(binaryPath)) {
      return {
        blob: null,
        format: null,
        stdout: [],
        stderr: [
          `OpenSCAD native binary not found at: ${binaryPath}. Please run setup.`,
        ],
        error: true,
      }
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
    let runDir: string
    let mainFilePath: string
    let isTemp = false

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
        await this.mirrorDirectory(projectDirectory, runDir, overrides || {})
      }

      // Write overrides (deleting any existing file/symlink first)
      if (overrides) {
        for (const [vPath, entry] of Object.entries(overrides)) {
          const rel = vPath.startsWith('/') ? vPath.slice(1) : vPath
          const dest = path.join(runDir, rel)
          await fsPromises.mkdir(path.dirname(dest), { recursive: true })
          try {
            await fsPromises.unlink(dest)
          } catch {
            // ignore
          }
          await fsPromises.writeFile(dest, entry.content, 'utf8')
        }
      }

      // Ensure main file code is written/overwritten
      const mainRel = main.path.startsWith('/') ? main.path.slice(1) : main.path
      mainFilePath = path.join(runDir, mainRel)
      await fsPromises.mkdir(path.dirname(mainFilePath), { recursive: true })
      try {
        await fsPromises.unlink(mainFilePath)
      } catch {
        // ignore
      }
      await fsPromises.writeFile(mainFilePath, main.code, 'utf8')
    } else {
      runDir = projectDirectory
      const mainRel = main.path.startsWith('/') ? main.path.slice(1) : main.path
      mainFilePath = path.join(projectDirectory, mainRel)
    }

    // Set variable arguments
    const varArgs = vars
      ? Object.entries(vars).map(([k, v]) => `-D${k}=${formatValue(v)}`)
      : []

    try {
      if (action === 'checkSyntax') {
        const outPath = path.join(runDir, 'out.json')
        const args = [
          '-o',
          outPath,
          '--export-format=param',
          ...varArgs,
          mainFilePath,
        ]

        const { stdout, stderr, exitCode } = await runOpenSCAD(
          binaryPath,
          args,
          spawnEnv,
        )
        const error =
          exitCode !== 0 || stderr.some((line) => line.includes('ERROR:'))

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
        const outPath = path.join(runDir, 'out.off')
        const args = [
          '-o',
          outPath,
          '--export-format=off',
          '--backend=manifold',
          '--enable=lazy-union',
          ...varArgs,
          mainFilePath,
        ]

        const { stdout, stderr, exitCode } = await runOpenSCAD(
          binaryPath,
          args,
          spawnEnv,
        )
        const error =
          exitCode !== 0 || stderr.some((line) => line.includes('ERROR:'))

        // Check if output file was created and read it
        if (!error && fs.existsSync(outPath)) {
          const blob = await fsPromises.readFile(outPath)
          return {
            blob: new Uint8Array(blob),
            format: 'off',
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
          const svgOutPath = path.join(runDir, 'out.svg')
          const svgArgs = [
            '-o',
            svgOutPath,
            '--export-format=svg',
            ...varArgs,
            mainFilePath,
          ]

          const svgRes = await runOpenSCAD(binaryPath, svgArgs, spawnEnv)
          const svgError =
            svgRes.exitCode !== 0 ||
            svgRes.stderr.some((line) => line.includes('ERROR:'))

          stdout.push(...svgRes.stdout)
          stderr.push(...svgRes.stderr)

          if (!svgError && fs.existsSync(svgOutPath)) {
            const blob = await fsPromises.readFile(svgOutPath)
            return {
              blob: new Uint8Array(blob),
              format: 'svg',
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

        const outPath = path.join(runDir, `out.${fileExt}`)

        const args = [
          '-o',
          outPath,
          `--export-format=${openSCADFormat}`,
          '--backend=manifold',
          '--enable=lazy-union',
          ...varArgs,
          mainFilePath,
        ]

        const { stdout, stderr, exitCode } = await runOpenSCAD(
          binaryPath,
          args,
          spawnEnv,
        )
        const error =
          exitCode !== 0 || stderr.some((line) => line.includes('ERROR:'))

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

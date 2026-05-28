/**
 * Reference from: https://github.com/seasick/openscad-web-gui/blob/main/src/worker/openSCAD.ts
 */
import { configure, fs, mounts, Port, vfs } from '@zenfs/core'

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
  private ws: WebSocket | undefined
  private currentRemoteFsUrl: string | undefined

  private async ensureRemoteFs(remoteFsUrl?: string): Promise<void> {
    if (!remoteFsUrl) return

    // Reuse existing connection if URL matches
    if (
      this.currentRemoteFsUrl === remoteFsUrl &&
      this.ws?.readyState === WebSocket.OPEN
    )
      return

    // Close stale connection
    this.ws?.close()
    this.ws = undefined
    this.currentRemoteFsUrl = undefined

    // Unmount stale /project mount
    if (mounts.has('/project')) {
      ;(vfs.umount as unknown as (path: string) => void)('/project')
    }

    // Create new connection
    this.ws = new WebSocket(remoteFsUrl)
    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve()
      this.ws!.onerror = reject
    })

    await configure({
      mounts: {
        '/project': { backend: Port, port: this.ws, disableAsyncCache: true },
      },
    })

    this.currentRemoteFsUrl = remoteFsUrl
  }

  private async createInstance(
    stdout: string[],
    stderr: string[],
    main: { path: string; code: string },
    remoteFsUrl?: string,
    overrides?: Record<string, { content: string }>,
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

    await this.setupFS(instance, main, remoteFsUrl, overrides)

    return instance
  }

  private async setupFS(
    instance: OpenSCAD,
    main: { path: string; code: string },
    remoteFsUrl?: string,
    overrides?: Record<string, { content: string }>,
  ) {
    await this.ensureRemoteFs(remoteFsUrl)

    // Resolve dependencies recursively starting from the main file
    const dependencyPaths = await resolveProjectDependencies(
      main.code,
      main.path,
      async (p) => {
        // 1. Check overrides
        if (overrides && overrides[p]) return overrides[p].content

        // 2. Check remote project (preferred over bundled libraries so users
        //    can drop an edited copy of a library file into their project)
        if (remoteFsUrl) {
          try {
            const zenPath = `/project${p.startsWith('/') ? '' : '/'}${p}`
            return await fs.promises.readFile(zenPath, 'utf8')
          } catch {
            // not found in project — fall through to libraries
          }
        }

        // 3. Check bundled libraries
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

      let content: string | Uint8Array | null = null

      // Priority: Overrides > Remote project > Bundled libraries
      if (overrides && overrides[depPath]) {
        content = overrides[depPath].content
      } else if (remoteFsUrl) {
        try {
          const zenPath = `/project${depPath.startsWith('/') ? '' : '/'}${depPath}`
          content = await fs.promises.readFile(zenPath)
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
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(
      stdout,
      stderr,
      main,
      remoteFsUrl,
      overrides,
    )

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
        return this.compileSVG(
          main,
          overrides,
          remoteFsUrl,
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
    remoteFsUrl: string | undefined,
    stdout: string[],
    stderr: string[],
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const svgInstance = await this.createInstance(
      stdout,
      stderr,
      main,
      remoteFsUrl,
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
    remoteFsUrl?: string,
    vars?: Record<string, unknown>,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(
      stdout,
      stderr,
      main,
      remoteFsUrl,
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
    remoteFsUrl?: string,
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(
      stdout,
      stderr,
      main,
      remoteFsUrl,
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

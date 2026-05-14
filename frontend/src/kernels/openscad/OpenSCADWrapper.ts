/**
 * Reference from: https://github.com/seasick/openscad-web-gui/blob/main/src/worker/openSCAD.ts
 */
import { configure, fs, mounts, Port, vfs } from '@zenfs/core'

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
}

export class OpenSCADWrapper {
  private libraryLoader = new LibraryLoader()

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
    let ws: WebSocket | undefined

    if (remoteFsUrl) {
      // Unmount stale /project mount from a previous compilation
      if (mounts.has('/project')) {
        ;(vfs.umount as unknown as (path: string) => void)('/project')
      }

      ws = new WebSocket(remoteFsUrl)

      // Wait for WS to open
      await new Promise((resolve, reject) => {
        ws!.onopen = resolve
        ws!.onerror = reject
      })

      await configure({
        mounts: {
          '/project': { backend: Port, port: ws, disableAsyncCache: true },
        },
      })
    }

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

    if (ws) {
      ws.close()
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

    instance.callMain([
      '-o',
      '/out.stl',
      '--export-format=binstl',
      '--enable=manifold',
      '--enable=fast-csg',
      '--enable=lazy-union',
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
      // No output file produced — check if it was a 2D geometry
      if (
        stderr.some((line) =>
          line.includes('Current top level object is not a 3D object'),
        )
      ) {
        return this.compileSVG(targetPath, instance, stdout, stderr)
      }

      return { blob: null, format: null, stdout, stderr, error: true }
    }
  }

  /** Compiles OpenSCAD code to SVG (for 2D sketches) */
  private compileSVG(
    targetPath: string,
    instance: OpenSCAD,
    stdout: string[],
    stderr: string[],
  ): CompileResult {
    // Note: code is already written to targetPath in compile()
    instance.callMain(['-o', '/out.svg', '--export-format=svg', targetPath])

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
  async exportSTL(
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

    instance.callMain([
      '-o',
      '/out.stl',
      '--export-format=binstl',
      '--enable=manifold',
      '--enable=fast-csg',
      '--enable=lazy-union',
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
}

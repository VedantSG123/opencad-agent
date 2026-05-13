/**
 * Reference from: https://github.com/seasick/openscad-web-gui/blob/main/src/worker/openSCAD.ts
 */
import { configure, fs, InMemory, Port } from '@zenfs/core'

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
  private async createInstance(
    stdout: string[],
    stderr: string[],
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

    if (remoteFsUrl) {
      await this.setupFS(instance, remoteFsUrl, overrides)
    } else if (overrides) {
      await this.setupFS(instance, undefined, overrides)
    }

    return instance
  }

  private async setupFS(
    instance: OpenSCAD,
    remoteFsUrl?: string,
    overrides?: Record<string, { content: string }>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mountPoints: Record<string, any> = {}
    let ws: WebSocket | undefined

    // 1. Setup ZenFS with Port (backend) if remoteFsUrl is provided
    if (remoteFsUrl) {
      ws = new WebSocket(remoteFsUrl)

      // Wait for WS to open
      await new Promise((resolve, reject) => {
        ws!.onopen = resolve
        ws!.onerror = reject
      })

      mountPoints['/project'] = { backend: Port, port: ws }
    }

    if (overrides) {
      mountPoints['/overrides'] = { backend: InMemory }
    }

    if (Object.keys(mountPoints).length > 0) {
      await configure({
        mounts: mountPoints,
      })
    }

    // 2. Populate ZenFS overrides
    if (overrides) {
      for (const [path, { content }] of Object.entries(overrides)) {
        const zenPath = `/overrides${path.startsWith('/') ? '' : '/'}${path}`
        await this.mkdirForZenFile(zenPath)
        await fs.promises.writeFile(zenPath, content)
      }
    }

    // 3. Recursively copy files from /project to Emscripten FS
    if (remoteFsUrl) {
      await this.copyRecursive('/', '/project', instance)
    }

    // 4. Apply overrides to Emscripten FS
    if (overrides) {
      for (const path of Object.keys(overrides)) {
        const zenPath = `/overrides${path.startsWith('/') ? '' : '/'}${path}`
        const content = await fs.promises.readFile(zenPath)
        this.mkdirForFile(instance, path)
        instance.FS.writeFile(path, content)
      }
    }

    if (ws) {
      ws.close()
    }
  }

  private async copyRecursive(
    destDir: string,
    srcDir: string,
    instance: OpenSCAD,
  ) {
    const entries = await fs.promises.readdir(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = `${srcDir}/${entry.name}`
      const destPath = `${destDir}/${entry.name}`

      if (entry.isDirectory()) {
        try {
          instance.FS.mkdir(destPath)
        } catch {
          // already exists
        }
        await this.copyRecursive(destPath, srcPath, instance)
      } else {
        const content = await fs.promises.readFile(srcPath)
        instance.FS.writeFile(destPath, content)
      }
    }
  }

  /** Recursively creates parent directories for a file path in ZenFS */
  private async mkdirForZenFile(filePath: string): Promise<void> {
    const parts = filePath.split('/').filter(Boolean)
    parts.pop()
    let current = ''
    for (const part of parts) {
      current += '/' + part
      try {
        await fs.promises.mkdir(current)
      } catch {
        // directory already exists
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
  ): Promise<CompileResult> {
    const stdout: string[] = []
    const stderr: string[] = []
    const instance = await this.createInstance(
      stdout,
      stderr,
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

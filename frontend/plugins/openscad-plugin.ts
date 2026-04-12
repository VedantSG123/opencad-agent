#!/usr/bin/env node

/**
 * Implementation Inspiration from: https://github.com/openscad/openscad-playground/blob/main/webpack-libs-plugin.js
 */

import { exec } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

import type { Plugin } from 'vite'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenSCADPluginOptions {
  /** Path to the JSON config file. Default: 'libs-config.json' */
  configFile?: string
  /** Directory where repos and WASM are downloaded. Default: 'libs' */
  libsDir?: string
  /** Public directory where library zips are written. Default: 'public/libraries' */
  publicLibsDir?: string
  /**
   * Directory containing the openscad.js / openscad.wasm that the app imports.
   * Copies are placed here from the downloaded WASM build.
   * Default: 'src/kernels/openscad/library'
   */
  srcLibraryDir?: string
  /** Which step(s) to run. Default: 'all' */
  buildMode?: 'all' | 'wasm' | 'fonts' | 'libs' | 'clean'
}

interface LibsConfig {
  wasmBuild: {
    url: string
    target: string
  }
  libraries: Array<{
    name: string
    repo: string
    branch: string
    zipIncludes?: string[]
    zipExcludes?: string[]
    workingDir?: string
  }>
  fonts: {
    notoFonts: string[]
    notoBaseUrl: string
    liberationRepo: string
    liberationBranch: string
  }
}

// ---------------------------------------------------------------------------
// Core class (mirrors OpenSCADLibrariesPlugin from the webpack plugin)
// ---------------------------------------------------------------------------

class OpenSCADLibrariesPlugin {
  private configFile: string
  private libsDir: string
  private publicLibsDir: string
  private srcLibraryDir: string
  private buildMode: NonNullable<OpenSCADPluginOptions['buildMode']>
  private config: LibsConfig | null = null

  constructor(options: OpenSCADPluginOptions = {}) {
    this.configFile = options.configFile ?? 'openscad-libs-config.json'
    this.libsDir = options.libsDir ?? 'libs'
    this.publicLibsDir = options.publicLibsDir ?? 'public/libraries'
    this.srcLibraryDir = options.srcLibraryDir ?? 'src/kernels/openscad/library'
    this.buildMode = options.buildMode ?? 'all'
  }

  async run(): Promise<void> {
    await this.loadConfig()

    switch (this.buildMode) {
      case 'all':
        await this.buildAll()
        break
      case 'wasm':
        await this.buildWasm()
        break
      case 'fonts':
        await this.buildFonts()
        break
      case 'libs':
        await this.buildAllLibraries()
        break
      case 'clean':
        await this.clean()
        break
    }
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  private async loadConfig(): Promise<void> {
    const content = await fs.readFile(this.configFile, 'utf-8')
    this.config = JSON.parse(content) as LibsConfig
  }

  private get cfg(): LibsConfig {
    if (!this.config) throw new Error('Config not loaded')
    return this.config
  }

  // ---------------------------------------------------------------------------
  // File system helpers
  // ---------------------------------------------------------------------------

  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  // ---------------------------------------------------------------------------
  // Network helpers
  // ---------------------------------------------------------------------------

  private downloadFile(url: string, outputPath: string): Promise<void> {
    console.log(`[openscad-plugin] Downloading ${url}`)
    return new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            return this.downloadFile(response.headers.location!, outputPath)
              .then(resolve)
              .catch(reject)
          }
          if (response.statusCode !== 200) {
            reject(
              new Error(`Download failed with status ${response.statusCode}`),
            )
            return
          }
          const fileStream = createWriteStream(outputPath)
          pipeline(response, fileStream).then(resolve).catch(reject)
        })
        .on('error', reject)
    })
  }

  private async cloneRepo(
    repo: string,
    targetDir: string,
    branch = 'master',
    shallow = true,
  ): Promise<void> {
    const args = [
      'clone',
      '--recurse',
      shallow ? '--depth 1' : '',
      `--branch ${branch}`,
      '--single-branch',
      repo,
      targetDir,
    ]
      .filter(Boolean)
      .join(' ')

    console.log(`[openscad-plugin] Cloning ${repo}`)
    await execAsync(`git ${args}`)
  }

  // ---------------------------------------------------------------------------
  // Zip helper
  // ---------------------------------------------------------------------------

  private async createZip(
    sourceDir: string,
    outputPath: string,
    includes: string[] = [],
    excludes: string[] = [],
    workingDir = '.',
  ): Promise<void> {
    await this.ensureDir(path.dirname(outputPath))

    const fullSourceDir = path.join(sourceDir, workingDir)

    let findCmd: string
    if (includes.length > 0) {
      const patterns = includes
        .map((pattern) => {
          if (pattern.includes('**/*.')) {
            const parts = pattern.split('/')
            const dir = parts[0]
            const file = parts[parts.length - 1]
            return `-path "./${dir}/*" -name "${file}"`
          }
          if (pattern.includes('**')) {
            return `-name "${pattern.replace('**/', '')}"`
          }
          if (pattern.includes('*')) {
            return `-name "${pattern}"`
          }
          if (pattern.includes('/')) {
            return `-path "./${pattern}"`
          }
          return `-name "${pattern}" -o -path "./${pattern}/*"`
        })
        .join(' -o ')
      findCmd = `find . \\( ${patterns} \\)`
    } else {
      findCmd = 'find . -name "*.scad"'
    }

    if (excludes.length > 0) {
      const excludeFlags = excludes
        .map(
          (p) => `-not -path "*/${p.replace('**/', '').replace('/**', '')}*"`,
        )
        .join(' ')
      findCmd += ` ${excludeFlags}`
    }

    const zipCmd = `cd ${fullSourceDir} && ${findCmd} | zip -r ${path.resolve(outputPath)} -@`
    console.log(`[openscad-plugin] Creating zip: ${outputPath}`)
    await execAsync(zipCmd)
  }

  // ---------------------------------------------------------------------------
  // WASM setup
  // ---------------------------------------------------------------------------

  private async buildWasm(): Promise<void> {
    const { wasmBuild } = this.cfg
    const wasmDir = wasmBuild.target
    const wasmZip = `${wasmDir}.zip`
    const srcJs = path.join(wasmDir, 'openscad.js')
    const srcWasm = path.join(wasmDir, 'openscad.wasm')

    await this.ensureDir(this.srcLibraryDir)

    const jsDest = path.join(this.srcLibraryDir, 'openscad.js')
    const wasmDest = path.join(this.srcLibraryDir, 'openscad.wasm')

    // If files are already present at the destination, nothing to do.
    if (existsSync(jsDest) && existsSync(wasmDest)) {
      console.log('[openscad-plugin] WASM already present, skipping')
      return
    }

    // Download and extract only if the extracted files aren't already cached.
    if (!existsSync(srcJs) || !existsSync(srcWasm)) {
      await this.ensureDir(this.libsDir)
      await this.ensureDir(wasmDir)

      if (!existsSync(wasmZip)) {
        await this.downloadFile(wasmBuild.url, wasmZip)
      }

      // Validate the zip — a partial/corrupted download will fail the test.
      try {
        await execAsync(`unzip -t ${wasmZip}`)
      } catch {
        console.warn('[openscad-plugin] Zip is corrupt, re-downloading...')
        await fs.rm(wasmZip, { force: true })
        await this.downloadFile(wasmBuild.url, wasmZip)
      }

      console.log(`[openscad-plugin] Extracting WASM to ${wasmDir}`)
      await execAsync(`cd ${wasmDir} && unzip -o ../${path.basename(wasmZip)}`)
    }

    // Copy openscad.js and openscad.wasm directly into the src library dir so
    // the existing imports (./library/openscad.js and ./library/openscad.wasm?url)
    // resolve without any indirection.
    await fs.copyFile(srcJs, jsDest)
    await fs.copyFile(srcWasm, wasmDest)

    console.log('[openscad-plugin] WASM setup completed')
  }

  // ---------------------------------------------------------------------------
  // Fonts setup
  // ---------------------------------------------------------------------------

  private async buildFonts(): Promise<void> {
    const { fonts } = this.cfg
    const notoDir = path.join(this.libsDir, 'noto')
    const liberationDir = path.join(this.libsDir, 'liberation')

    await this.ensureDir(notoDir)

    for (const font of fonts.notoFonts) {
      const fontPath = path.join(notoDir, font)
      if (!existsSync(fontPath)) {
        await this.downloadFile(fonts.notoBaseUrl + font, fontPath)
      }
    }

    if (!existsSync(liberationDir)) {
      await this.cloneRepo(
        fonts.liberationRepo,
        liberationDir,
        fonts.liberationBranch,
      )
    }

    await this.ensureDir(this.publicLibsDir)
    const fontsZip = path.join(this.publicLibsDir, 'fonts.zip')

    console.log('[openscad-plugin] Creating fonts.zip')
    await execAsync(
      `zip -r ${fontsZip} -j fonts.conf ${notoDir}/*.ttf ${liberationDir}/*.ttf ${liberationDir}/LICENSE ${liberationDir}/AUTHORS`,
    )

    console.log('[openscad-plugin] Fonts setup completed')
  }

  // ---------------------------------------------------------------------------
  // Library setup
  // ---------------------------------------------------------------------------

  private async buildLibrary(
    library: LibsConfig['libraries'][number],
  ): Promise<void> {
    const libDir = path.join(this.libsDir, library.name)
    const zipPath = path.join(this.publicLibsDir, `${library.name}.zip`)

    if (!existsSync(libDir)) {
      await this.cloneRepo(library.repo, libDir, library.branch)
    }

    await this.createZip(
      libDir,
      zipPath,
      library.zipIncludes ?? ['*.scad'],
      library.zipExcludes ?? [],
      library.workingDir ?? '.',
    )

    console.log(`[openscad-plugin] Built ${library.name}`)
  }

  private async buildAllLibraries(): Promise<void> {
    await this.ensureDir(this.publicLibsDir)
    for (const library of this.cfg.libraries) {
      await this.buildLibrary(library)
    }
  }

  // ---------------------------------------------------------------------------
  // Build all
  // ---------------------------------------------------------------------------

  private async buildAll(): Promise<void> {
    console.log('[openscad-plugin] Setting up OpenSCAD assets...')
    await this.buildWasm()
    await this.buildFonts()
    await this.buildAllLibraries()
    console.log('[openscad-plugin] Setup completed')
  }

  // ---------------------------------------------------------------------------
  // Clean
  // ---------------------------------------------------------------------------

  private async clean(): Promise<void> {
    console.log('[openscad-plugin] Cleaning build artifacts...')

    const targets = [
      this.libsDir,
      path.join(this.srcLibraryDir, 'openscad.js'),
      path.join(this.srcLibraryDir, 'openscad.wasm'),
      this.publicLibsDir,
    ]

    for (const target of targets) {
      await fs.rm(target, { recursive: true, force: true })
    }

    console.log('[openscad-plugin] Clean completed')
  }
}

// ---------------------------------------------------------------------------
// Vite plugin export
// ---------------------------------------------------------------------------

export function openscadPlugin(options: OpenSCADPluginOptions = {}): Plugin {
  const plugin = new OpenSCADLibrariesPlugin(options)
  let ran = false

  return {
    name: 'vite-plugin-openscad',
    // buildStart runs on both `vite dev` and `vite build`
    async buildStart() {
      if (ran) return
      ran = true
      await plugin.run()
    },
  }
}

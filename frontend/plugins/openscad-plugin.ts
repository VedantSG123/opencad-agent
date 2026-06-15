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

import { unzipSync, zipSync } from 'fflate'
import type { Plugin } from 'vite'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Helpers for cross-platform file walker and pattern matcher
// ---------------------------------------------------------------------------

interface FileEntry {
  absolutePath: string
  relativePath: string
}

async function getFiles(dir: string, baseDir = dir): Promise<FileEntry[]> {
  const files: FileEntry[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await getFiles(fullPath, baseDir)))
    } else if (entry.isFile()) {
      files.push({
        absolutePath: fullPath,
        relativePath: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
      })
    }
  }
  return files
}

function matchesPattern(
  relPath: string,
  pattern: string,
  absoluteFilePath: string,
  fullSourceDir: string,
): boolean {
  if (pattern.includes('..')) {
    const targetAbsPath = path.resolve(fullSourceDir, pattern)
    return absoluteFilePath === targetAbsPath
  }

  const normalizedRelPath = relPath.replace(/\\/g, '/')
  const filename = path.basename(normalizedRelPath)

  if (pattern.includes('**')) {
    if (pattern.startsWith('**/*.')) {
      const ext = pattern.slice(5)
      return normalizedRelPath.endsWith('.' + ext)
    }
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\*]/g, '\\$&')
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^/]*')
    const regex = new RegExp('^' + regexPattern + '$')
    return regex.test(normalizedRelPath)
  }

  if (pattern.includes('*')) {
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(2)
      return normalizedRelPath.endsWith('.' + ext)
    }
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\*]/g, '\\$&')
      .replace(/\\\*/g, '[^/]*')
    const regex = new RegExp('^' + regexPattern + '$')
    return regex.test(normalizedRelPath)
  }

  if (filename === pattern) {
    return true
  }
  if (
    normalizedRelPath === pattern ||
    normalizedRelPath.startsWith(pattern + '/')
  ) {
    return true
  }

  return false
}

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
    const allFiles = await getFiles(sourceDir)

    const zipFiles: Record<string, Uint8Array> = {}
    const actualIncludes = includes.length > 0 ? includes : ['**/*.scad']

    for (const file of allFiles) {
      const relPath = path
        .relative(fullSourceDir, file.absolutePath)
        .replace(/\\/g, '/')

      const isIncluded = actualIncludes.some((pat) =>
        matchesPattern(relPath, pat, file.absolutePath, fullSourceDir),
      )
      if (!isIncluded) continue

      const isExcluded = excludes.some((pat) =>
        matchesPattern(relPath, pat, file.absolutePath, fullSourceDir),
      )
      if (isExcluded) continue

      const content = await fs.readFile(file.absolutePath)
      const zipPath = relPath.startsWith('../')
        ? path.basename(relPath)
        : relPath
      zipFiles[zipPath] = new Uint8Array(content)
    }

    const zipped = zipSync(zipFiles)
    console.log(`[openscad-plugin] Creating zip: ${outputPath}`)
    await fs.writeFile(outputPath, zipped)
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
      let decompressed!: Record<string, Uint8Array>
      try {
        const zipBuffer = await fs.readFile(wasmZip)
        decompressed = unzipSync(new Uint8Array(zipBuffer))
      } catch {
        console.warn('[openscad-plugin] Zip is corrupt, re-downloading...')
        await fs.rm(wasmZip, { force: true })
        await this.downloadFile(wasmBuild.url, wasmZip)
        const zipBuffer = await fs.readFile(wasmZip)
        decompressed = unzipSync(new Uint8Array(zipBuffer))
      }

      console.log(`[openscad-plugin] Extracting WASM to ${wasmDir}`)
      for (const [relPath, data] of Object.entries(decompressed)) {
        const targetPath = path.join(wasmDir, relPath)
        if (relPath.endsWith('/')) {
          await fs.mkdir(targetPath, { recursive: true })
        } else {
          await fs.mkdir(path.dirname(targetPath), { recursive: true })
          await fs.writeFile(targetPath, data)
        }
      }
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
    const zipFiles: Record<string, Uint8Array> = {}
    const fontsConfContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/fonts</dir>
  <cachedir>/cachedir</cachedir>
</fontconfig>`
    zipFiles['fonts.conf'] = new TextEncoder().encode(fontsConfContent)

    const notoFiles = await fs.readdir(notoDir)
    for (const file of notoFiles) {
      if (file.endsWith('.ttf')) {
        const content = await fs.readFile(path.join(notoDir, file))
        zipFiles[file] = new Uint8Array(content)
      }
    }

    const liberationFiles = await fs.readdir(liberationDir)
    for (const file of liberationFiles) {
      if (file.endsWith('.ttf') || file === 'LICENSE' || file === 'AUTHORS') {
        const content = await fs.readFile(path.join(liberationDir, file))
        zipFiles[file] = new Uint8Array(content)
      }
    }

    const zipped = zipSync(zipFiles)
    await fs.writeFile(fontsZip, zipped)

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

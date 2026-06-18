/**
 * Implementation Inspiration from: https://github.com/openscad/openscad-playground/blob/main/webpack-libs-plugin.js
 *
 * Standalone setup script for Electron OpenSCAD resources.
 * Runs before `bun run build` and `bun run dev` in electron/package.json.
 *
 * What it does:
 *   1. Downloads & extracts Node WASM build → electron/src/lib/openscad/
 *   2. Downloads & extracts Node WASM build → electron/openscad-libs/
 *   3. Clones library repos, creates zips    → electron/openscad-libs/libraries/
 *   4. Downloads fonts, creates fonts.zip    → electron/openscad-libs/libraries/
 *   5. Copies config                         → electron/openscad-libs/
 */

import { exec } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

import { unzipSync, zipSync } from 'fflate'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileEntry {
  absolutePath: string
  relativePath: string
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
    symlinks?: Record<string, string>
  }>
  fonts: {
    notoFonts: string[]
    notoBaseUrl: string
    liberationRepo: string
    liberationBranch: string
  }
}

// ---------------------------------------------------------------------------
// Directory Constants
// ---------------------------------------------------------------------------

/** Directory of this script (electron/scripts/) */
const SCRIPT_DIR = import.meta.dirname

/** Electron package root */
const ELECTRON_ROOT_DIR = path.resolve(SCRIPT_DIR, '..')

// ── Temp directory (downloads + git clones, cleaned up) ──────────────────
const TEMP_DIR = path.join(ELECTRON_ROOT_DIR, 'temp')
const TEMP_WASM = path.join(TEMP_DIR, 'wasm')
const TEMP_NOTO = path.join(TEMP_DIR, 'noto')
const TEMP_LIBERATION = path.join(TEMP_DIR, 'liberation')
const TEMP_LIBS = path.join(TEMP_DIR, 'libs')

// ── Output directories ───────────────────────────────────────────────────

/** WASM files for development imports (dynamic import in Node worker) */
const WASM_DEV_DIR = path.join(ELECTRON_ROOT_DIR, 'src', 'lib', 'openscad')

/** Production-ready resources dir (included in electron-builder extraResources) */
const RESOURCES_DIR = path.join(ELECTRON_ROOT_DIR, 'openscad-libs')
const RESOURCES_LIBS_DIR = path.join(RESOURCES_DIR, 'libraries')

// ── Config files ─────────────────────────────────────────────────────────

const CONFIG_FILE = path.join(ELECTRON_ROOT_DIR, 'openscad-libs-config.json')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // Handle `../` prefix patterns (e.g. "../LICENSE")
  if (pattern.includes('..')) {
    const targetAbsPath = path.resolve(fullSourceDir, pattern)
    return absoluteFilePath === targetAbsPath
  }

  const normalizedRelPath = relPath.replace(/\\/g, '/')
  const filename = path.basename(normalizedRelPath)

  // Globstar patterns (e.g. "**/*.scad", "**/tests/**")
  if (pattern.includes('**')) {
    if (pattern.startsWith('**/*.')) {
      const ext = pattern.slice(5)
      return normalizedRelPath.endsWith('.' + ext)
    }
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\*]/g, '\\$&')
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^/]*')
    return new RegExp('^' + regexPattern + '$').test(normalizedRelPath)
  }

  // Simple glob (e.g. "*.scad", "demo/*.scad")
  if (pattern.includes('*')) {
    if (pattern.startsWith('*.')) {
      return normalizedRelPath.endsWith('.' + pattern.slice(2))
    }
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\*]/g, '\\$&')
      .replace(/\\\*/g, '[^/]*')
    return new RegExp('^' + regexPattern + '$').test(normalizedRelPath)
  }

  // Exact match: filename, relative path, or directory prefix
  if (filename === pattern) return true
  if (normalizedRelPath === pattern) return true
  if (normalizedRelPath.startsWith(pattern + '/')) return true

  return false
}

async function ensureDirs(dirs: string[]): Promise<void> {
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// OpenSCADSetup
// ---------------------------------------------------------------------------

class OpenSCADSetup {
  private config: LibsConfig | null = null

  // ── Public API ───────────────────────────────────────────────────────

  async run(): Promise<void> {
    console.log('[setup-openscad] Starting OpenSCAD resource setup...')
    console.log(`  Temp dir:        ${TEMP_DIR}`)
    console.log(`  Resources dir:   ${RESOURCES_DIR}`)
    console.log(`  WASM dev dir:    ${WASM_DEV_DIR}`)

    await this.loadConfig()
    await ensureDirs([
      TEMP_DIR,
      TEMP_WASM,
      TEMP_NOTO,
      TEMP_LIBERATION,
      TEMP_LIBS,
      RESOURCES_DIR,
      RESOURCES_LIBS_DIR,
      WASM_DEV_DIR,
    ])

    // Step 1: WASM
    console.log('\n[setup-openscad] === WASM Build ===')
    await this.buildWasm()

    // Step 2: Fonts
    console.log('\n[setup-openscad] === Fonts ===')
    await this.buildFonts()

    // Step 3: Libraries
    console.log('\n[setup-openscad] === Libraries ===')
    await this.buildAllLibraries()

    // Step 4: Config
    await fs.copyFile(
      CONFIG_FILE,
      path.join(RESOURCES_DIR, 'openscad-libs-config.json'),
    )

    console.log('\n[setup-openscad] ✅ OpenSCAD setup completed successfully!')
  }

  // ── Config ──────────────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    if (!existsSync(CONFIG_FILE)) {
      throw new Error(`Config file not found at ${CONFIG_FILE}`)
    }
    const content = await fs.readFile(CONFIG_FILE, 'utf-8')
    this.config = JSON.parse(content) as LibsConfig
  }

  private get cfg(): LibsConfig {
    if (!this.config) throw new Error('Config not loaded')
    return this.config
  }

  // ── Network ─────────────────────────────────────────────────────────

  private downloadFile(url: string, outputPath: string): Promise<void> {
    console.log(`[setup-openscad] Downloading ${url}`)
    return new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            this.downloadFile(response.headers.location!, outputPath)
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
      shallow ? '--depth 1' : '',
      `--branch ${branch}`,
      '--single-branch',
      repo,
      targetDir,
    ]
      .filter(Boolean)
      .join(' ')

    console.log(`[setup-openscad] Cloning ${repo}`)
    await execAsync(`git ${args}`)
  }

  // ── Zip ─────────────────────────────────────────────────────────────

  private async createZip(
    sourceDir: string,
    outputPath: string,
    includes: string[] = [],
    excludes: string[] = [],
    workingDir = '.',
  ): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })

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
    console.log(`[setup-openscad] Creating zip: ${outputPath}`)
    await fs.writeFile(outputPath, zipped)
  }

  /** Extract a zip archive into a target directory using fflate */
  private async extractZip(zipPath: string, targetDir: string): Promise<void> {
    const zipBuffer = await fs.readFile(zipPath)
    let decompressed!: Record<string, Uint8Array>
    try {
      decompressed = unzipSync(new Uint8Array(zipBuffer))
    } catch {
      console.warn('[setup-openscad] Zip is corrupt, re-downloading...')
      await fs.rm(zipPath, { force: true })
      throw new Error('Corrupt zip, please re-run setup')
    }

    console.log(`[setup-openscad] Extracting to ${targetDir}`)
    for (const [relPath, data] of Object.entries(decompressed)) {
      const targetPath = path.join(targetDir, relPath)
      if (relPath.endsWith('/')) {
        await fs.mkdir(targetPath, { recursive: true })
      } else {
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.writeFile(targetPath, data)
      }
    }
  }

  // ── WASM ────────────────────────────────────────────────────────────

  /**
   * Node WASM build used by the Electron worker thread (Node.js context).
   *
   * Two outputs:
   *   1. WASM_DEV_DIR   – imported at dev time (electron/src/lib/openscad/)
   *   2. RESOURCES_DIR  – bundled during packaging (electron/openscad-libs/)
   */
  private async buildWasm(): Promise<void> {
    const jsDestDev = path.join(WASM_DEV_DIR, 'openscad.js')
    const wasmDestDev = path.join(WASM_DEV_DIR, 'openscad.wasm')
    const jsDestProd = path.join(RESOURCES_DIR, 'openscad.js')
    const wasmDestProd = path.join(RESOURCES_DIR, 'openscad.wasm')

    // If both dev and prod wasm files already exist, skip
    if (
      existsSync(jsDestDev) &&
      existsSync(wasmDestDev) &&
      existsSync(jsDestProd) &&
      existsSync(wasmDestProd)
    ) {
      console.log(
        '[setup-openscad] WASM already present in both destinations, skipping',
      )
      return
    }

    const { wasmBuild } = this.cfg
    const wasmZip = path.join(TEMP_DIR, 'wasm-node.zip')

    // Download & extract if not already cached in TEMP_WASM
    if (!existsSync(path.join(TEMP_WASM, 'openscad.js'))) {
      if (!existsSync(wasmZip)) {
        await this.downloadFile(wasmBuild.url, wasmZip)
      }

      // Validate zip
      try {
        await this.extractZip(wasmZip, TEMP_WASM)
      } catch {
        console.log('[setup-openscad] Redownloading corrupt zip...')
        await this.downloadFile(wasmBuild.url, wasmZip)
        await this.extractZip(wasmZip, TEMP_WASM)
      }
    }

    const srcJs = path.join(TEMP_WASM, 'openscad.js')
    const srcWasm = path.join(TEMP_WASM, 'openscad.wasm')

    // Validate extracted files exist
    if (!existsSync(srcJs)) {
      throw new Error(
        `Expected openscad.js not found in extracted WASM at ${TEMP_WASM}`,
      )
    }

    // Copy to dev dir
    await fs.copyFile(srcJs, jsDestDev)
    if (existsSync(srcWasm)) {
      await fs.copyFile(srcWasm, wasmDestDev)
    }
    console.log(`[setup-openscad] WASM copied to ${WASM_DEV_DIR}`)
  }

  // ── Fonts ───────────────────────────────────────────────────────────

  private async buildFonts(): Promise<void> {
    const { fonts } = this.cfg
    const fontsZip = path.join(RESOURCES_LIBS_DIR, 'fonts.zip')

    if (existsSync(fontsZip)) {
      console.log('[setup-openscad] Fonts zip already present, skipping')
      return
    }

    // Download Noto fonts
    for (const font of fonts.notoFonts) {
      const fontPath = path.join(TEMP_NOTO, font)
      if (!existsSync(fontPath)) {
        await this.downloadFile(fonts.notoBaseUrl + font, fontPath)
      }
    }

    // Clone Liberation fonts
    if (!existsSync(TEMP_LIBERATION)) {
      await this.cloneRepo(
        fonts.liberationRepo,
        TEMP_LIBERATION,
        fonts.liberationBranch,
      )
    }

    // Package fonts.zip
    console.log('[setup-openscad] Packaging fonts.zip...')
    const zipFiles: Record<string, Uint8Array> = {}
    const fontsConfContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/fonts</dir>
  <cachedir>/cachedir</cachedir>
</fontconfig>`
    zipFiles['fonts.conf'] = new TextEncoder().encode(fontsConfContent)

    const notoFiles = await fs.readdir(TEMP_NOTO)
    for (const file of notoFiles) {
      if (file.endsWith('.ttf')) {
        zipFiles[file] = new Uint8Array(
          await fs.readFile(path.join(TEMP_NOTO, file)),
        )
      }
    }

    const liberationFiles = await fs.readdir(TEMP_LIBERATION)
    for (const file of liberationFiles) {
      if (file.endsWith('.ttf') || file === 'LICENSE' || file === 'AUTHORS') {
        zipFiles[file] = new Uint8Array(
          await fs.readFile(path.join(TEMP_LIBERATION, file)),
        )
      }
    }

    const zipped = zipSync(zipFiles)
    await fs.writeFile(fontsZip, zipped)
    console.log('[setup-openscad] Fonts packaged successfully!')
  }

  // ── Libraries ───────────────────────────────────────────────────────

  private async buildLibrary(
    library: LibsConfig['libraries'][number],
  ): Promise<void> {
    const libDir = path.join(TEMP_LIBS, library.name)
    const zipPath = path.join(RESOURCES_LIBS_DIR, `${library.name}.zip`)

    if (existsSync(zipPath)) {
      console.log(
        `[setup-openscad] ${library.name}.zip already exists, skipping`,
      )
      return
    }

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
    console.log(`[setup-openscad] Built ${library.name}`)
  }

  private async buildAllLibraries(): Promise<void> {
    for (const library of this.cfg.libraries) {
      await this.buildLibrary(library)
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

new OpenSCADSetup().run().catch((err) => {
  console.error('[setup-openscad] Failed to setup OpenSCAD resources:', err)
  process.exit(1)
})

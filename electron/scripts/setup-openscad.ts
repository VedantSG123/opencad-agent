/**
 * Standalone setup script for Electron OpenSCAD resources.
 * Runs before `bun run build` and `bun run dev` in electron/package.json.
 *
 * What it does:
 *   1. Detects host platform and downloads the corresponding native OpenSCAD snapshot binary.
 *   2. Extracts and saves the native binary to electron/openscad-libs/bin/
 *   3. Clones and copies libraries directly into electron/openscad-libs/libraries/
 *   4. Copies config to electron/openscad-libs/
 */

import { exec } from 'node:child_process'
import { chmodSync, createWriteStream, existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import https from 'node:https'
import { arch, platform } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

import { unzipSync } from 'fflate'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface LibsConfig {
  libraries: Array<{
    name: string
    repo: string
    branch: string
    zipIncludes?: string[]
    zipExcludes?: string[]
    workingDir?: string
    symlinks?: Record<string, string>
  }>
}

const BINARY_URLS: Record<string, string> = {
  macos: 'https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg',
  linux:
    'https://files.openscad.org/snapshots/OpenSCAD-2026.06.21-x86_64.AppImage',
  windows:
    'https://files.openscad.org/snapshots/OpenSCAD-2026.06.21-x86-64.zip',
}

const SCRIPT_DIR = import.meta.dirname
const ELECTRON_ROOT_DIR = path.resolve(SCRIPT_DIR, '..')

const TEMP_DIR = path.join(ELECTRON_ROOT_DIR, 'temp')
const TEMP_LIBS = path.join(TEMP_DIR, 'libs')

const RESOURCES_DIR = path.join(ELECTRON_ROOT_DIR, 'openscad-libs')
const RESOURCES_LIBS_DIR = path.join(RESOURCES_DIR, 'libraries')

const CONFIG_FILE = path.join(ELECTRON_ROOT_DIR, 'openscad-libs-config.json')

// ---------------------------------------------------------------------------
// Helpers
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
    return new RegExp('^' + regexPattern + '$').test(normalizedRelPath)
  }

  if (pattern.includes('*')) {
    if (pattern.startsWith('*.')) {
      return normalizedRelPath.endsWith('.' + pattern.slice(2))
    }
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\*]/g, '\\$&')
      .replace(/\\\*/g, '[^/]*')
    return new RegExp('^' + regexPattern + '$').test(normalizedRelPath)
  }

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

function detectPlatform(): 'macos' | 'linux' | 'windows' {
  const os = platform()
  const cpu = arch()

  let p: 'macos' | 'linux' | 'windows'
  if (os === 'darwin') {
    p = 'macos'
  } else if (os === 'linux') {
    p = 'linux'
  } else if (os === 'win32') {
    p = 'windows'
  } else {
    throw new Error(`Unsupported platform: ${os}`)
  }

  if (cpu !== 'x64' && cpu !== 'arm64') {
    throw new Error(`Unsupported architecture: ${cpu}`)
  }

  if ((p === 'linux' || p === 'windows') && cpu !== 'x64') {
    throw new Error(`${p} ${cpu} is not supported; only x64 is supported`)
  }

  return p
}

// ---------------------------------------------------------------------------
// Setup Class
// ---------------------------------------------------------------------------

class OpenSCADSetup {
  private config: LibsConfig | null = null

  async run(): Promise<void> {
    console.log('[setup-openscad] Starting OpenSCAD native resource setup...')
    console.log(`  Temp dir:        ${TEMP_DIR}`)
    console.log(`  Resources dir:   ${RESOURCES_DIR}`)

    await this.loadConfig()

    const binDir = path.join(RESOURCES_DIR, 'bin')
    await ensureDirs([
      TEMP_DIR,
      TEMP_LIBS,
      RESOURCES_DIR,
      RESOURCES_LIBS_DIR,
      binDir,
    ])

    // Step 1: Download & Setup Native OpenSCAD Binary
    console.log('\n[setup-openscad] === Native OpenSCAD Binary ===')
    await this.setupNativeBinary(binDir)

    // Step 2: Libraries
    console.log('\n[setup-openscad] === Libraries ===')
    await this.buildAllLibraries()

    // Step 3: Config Copy
    await fs.copyFile(
      CONFIG_FILE,
      path.join(RESOURCES_DIR, 'openscad-libs-config.json'),
    )

    console.log('\n[setup-openscad] ✅ OpenSCAD setup completed successfully!')
  }

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

  private downloadFile(url: string, outputPath: string): Promise<void> {
    console.log(`[setup-openscad] Downloading ${url}`)
    return new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          if (
            response.statusCode === 301 ||
            response.statusCode === 302 ||
            response.statusCode === 307 ||
            response.statusCode === 308
          ) {
            if (response.headers.location) {
              this.downloadFile(response.headers.location, outputPath)
                .then(resolve)
                .catch(reject)
              return
            }
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

  // ── Native Binary Setup ───────────────────────────────────────────────

  private async setupNativeBinary(binDir: string): Promise<void> {
    const p = detectPlatform()
    const url = BINARY_URLS[p]
    const isWin = p === 'windows'
    const binaryDest = path.join(binDir, isWin ? 'openscad.exe' : 'openscad')

    if (existsSync(binaryDest)) {
      console.log(
        `[setup-openscad] Native binary already present at ${binaryDest}`,
      )
      return
    }

    const ext = p === 'windows' ? '.zip' : p === 'macos' ? '.dmg' : '.AppImage'
    const dlPath = path.join(TEMP_DIR, `openscad-download${ext}`)

    // Download file
    await this.downloadFile(url, dlPath)

    if (p === 'windows') {
      console.log('[setup-openscad] Extracting Windows Zip...')
      const zipBuffer = await fs.readFile(dlPath)
      const decompressed = unzipSync(new Uint8Array(zipBuffer))

      let exePath: string | null = null
      const tempExtractDir = path.join(TEMP_DIR, 'extracted-win')
      await fs.mkdir(tempExtractDir, { recursive: true })

      for (const [relPath, data] of Object.entries(decompressed)) {
        const targetPath = path.join(tempExtractDir, relPath)
        if (relPath.endsWith('/')) {
          await fs.mkdir(targetPath, { recursive: true })
        } else {
          await fs.mkdir(path.dirname(targetPath), { recursive: true })
          await fs.writeFile(targetPath, data)
          const base = path.basename(relPath).toLowerCase()
          if (base === 'openscad.exe') {
            exePath = targetPath
          }
        }
      }

      if (!exePath) {
        throw new Error('openscad.exe not found in Windows zip')
      }
      await fs.copyFile(exePath, binaryDest)
      await fs.rm(tempExtractDir, { recursive: true, force: true })
    } else if (p === 'macos') {
      console.log('[setup-openscad] Mounting macOS DMG...')
      const mountPoint = path.join(TEMP_DIR, 'mnt')
      await fs.mkdir(mountPoint, { recursive: true })
      await execAsync(
        `hdiutil attach -nobrowse -mountpoint "${mountPoint}" "${dlPath}"`,
      )

      try {
        const { stdout } = await execAsync(
          `find "${mountPoint}" -name "openscad" -type f 2>/dev/null || true`,
        )
        const lines = stdout.trim().split('\n').filter(Boolean)
        if (lines.length === 0) {
          throw new Error('openscad binary not found inside macOS DMG mount')
        }
        const binaryInDMG = lines[0]
        console.log(`[setup-openscad] Copying macOS binary from ${binaryInDMG}`)
        await fs.copyFile(binaryInDMG, binaryDest)
        chmodSync(binaryDest, 0o755)
      } finally {
        await execAsync(
          `hdiutil detach "${mountPoint}" 2>/dev/null || true`,
        ).catch(() => {})
        await fs
          .rm(mountPoint, { recursive: true, force: true })
          .catch(() => {})
      }
    } else {
      console.log('[setup-openscad] Preparing Linux AppImage...')
      await fs.copyFile(dlPath, binaryDest)
      chmodSync(binaryDest, 0o755)
    }

    // Clean download file
    await fs.rm(dlPath, { force: true })
    console.log(
      `[setup-openscad] Native OpenSCAD binary prepared at ${binaryDest}`,
    )
  }

  // ── Libraries Setup ──────────────────────────────────────────────────

  private async copyLibraryFiles(
    sourceDir: string,
    destDir: string,
    includes: string[] = [],
    excludes: string[] = [],
    workingDir = '.',
  ): Promise<void> {
    await fs.mkdir(destDir, { recursive: true })

    const fullSourceDir = path.join(sourceDir, workingDir)
    const allFiles = await getFiles(sourceDir)
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

      const targetPath = path.join(
        destDir,
        relPath.startsWith('../') ? path.basename(relPath) : relPath,
      )
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.copyFile(file.absolutePath, targetPath)
    }
  }

  private async buildLibrary(
    library: LibsConfig['libraries'][number],
  ): Promise<void> {
    const libDir = path.join(TEMP_LIBS, library.name)
    const destDir = path.join(RESOURCES_LIBS_DIR, library.name)

    if (existsSync(destDir)) {
      console.log(
        `[setup-openscad] Library ${library.name} already exists, skipping`,
      )
      return
    }

    if (!existsSync(libDir)) {
      await this.cloneRepo(library.repo, libDir, library.branch)
    }

    await this.copyLibraryFiles(
      libDir,
      destDir,
      library.zipIncludes ?? ['*.scad'],
      library.zipExcludes ?? [],
      library.workingDir ?? '.',
    )

    // Setup symlinks/aliases in RESOURCES_LIBS_DIR
    if (library.symlinks) {
      for (const [alias, internalPath] of Object.entries(library.symlinks)) {
        const aliasPath = path.join(RESOURCES_LIBS_DIR, alias)
        const targetPath = path.join(destDir, internalPath)
        if (!existsSync(aliasPath) && existsSync(targetPath)) {
          const stats = await fs.stat(targetPath)
          const isDir = stats.isDirectory()
          try {
            if (platform() === 'win32') {
              if (isDir) {
                // Junction requires absolute path on Windows
                await fs.symlink(targetPath, aliasPath, 'junction')
              } else {
                await fs.symlink(targetPath, aliasPath, 'file')
              }
            } else {
              const relTarget = path.relative(
                path.dirname(aliasPath),
                targetPath,
              )
              await fs.symlink(relTarget, aliasPath, isDir ? 'dir' : 'file')
            }
          } catch {
            if (isDir) {
              await fs.cp(targetPath, aliasPath, { recursive: true })
            } else {
              await fs.copyFile(targetPath, aliasPath)
            }
          }
        }
      }
    }

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
  console.error(
    '[setup-openscad] Failed to setup OpenSCAD native resources:',
    err,
  )
  process.exit(1)
})

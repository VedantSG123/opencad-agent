import * as fs from 'node:fs'
import * as path from 'node:path'

import { Zip } from '@zenfs/archives'
import { configure, fs as zenFs, mounts } from '@zenfs/core'

type SymlinkEntry = { libName: string; internalPath: string }

interface LibConfig {
  libraries: Array<{
    name: string
    symlinks?: Record<string, string>
  }>
}

export class LibraryLoader {
  private openscadResourcesPath: string
  private mounting = new Map<string, Promise<void>>()
  private libraryNames = new Set<string>()
  private symlinkAliases = new Map<string, SymlinkEntry>()

  constructor(openscadResourcesPath: string) {
    this.openscadResourcesPath = openscadResourcesPath
    this.loadConfig()
  }

  private loadConfig() {
    try {
      const configPath = path.join(
        this.openscadResourcesPath,
        'openscad-libs-config.json',
      )
      const content = fs.readFileSync(configPath, 'utf8')
      const config = JSON.parse(content) as LibConfig

      for (const lib of config.libraries) {
        this.libraryNames.add(lib.name)
        if (lib.symlinks) {
          for (const [alias, target] of Object.entries(lib.symlinks)) {
            this.symlinkAliases.set(alias, {
              libName: lib.name,
              internalPath: target,
            })
          }
        }
      }
    } catch (err) {
      console.error(
        '[LibraryLoader] Failed to load openscad-libs-config.json:',
        err,
      )
    }
  }

  isLibraryPath(filePath: string): boolean {
    return this.resolveLibraryName(filePath) !== null
  }

  private resolveLibraryName(filePath: string): string | null {
    const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath
    const firstSegment = normalized.split('/')[0]

    if (this.libraryNames.has(firstSegment)) return firstSegment

    const alias = this.symlinkAliases.get(firstSegment)
    return alias ? alias.libName : null
  }

  async ensureMounted(libName: string): Promise<void> {
    const mountPoint = `/libraries/${libName}`
    if (mounts.has(mountPoint)) return

    if (this.mounting.has(libName)) {
      await this.mounting.get(libName)
      return
    }

    const promise = this.doMount(libName, mountPoint).catch((err) => {
      this.mounting.delete(libName)
      throw err
    })
    this.mounting.set(libName, promise)
    await promise
  }

  private async doMount(libName: string, mountPoint: string): Promise<void> {
    const zipPath = path.join(
      this.openscadResourcesPath,
      'libraries',
      `${libName}.zip`,
    )
    if (!fs.existsSync(zipPath)) {
      throw new Error(
        `[LibraryLoader] Library zip not found at path: ${zipPath}`,
      )
    }

    const data = await fs.promises.readFile(zipPath)
    await configure({ mounts: { [mountPoint]: { backend: Zip, data } } })

    if (libName === 'fonts') {
      return
    }

    // Primary directory symlink: /{libName} → /libraries/{libName}
    try {
      await zenFs.promises.symlink(mountPoint, `/${libName}`)
    } catch {
      // symlink already exists
    }

    // Extra root-level aliases defined in config
    for (const [alias, entry] of this.symlinkAliases.entries()) {
      if (entry.libName === libName) {
        try {
          await zenFs.promises.symlink(
            `${mountPoint}/${entry.internalPath}`,
            `/${alias}`,
          )
        } catch {
          // already exists
        }
      }
    }
  }

  async readFileAsText(filePath: string): Promise<string | null> {
    const libName = this.resolveLibraryName(filePath)
    if (!libName) return null
    try {
      await this.ensureMounted(libName)
      const data = await zenFs.promises.readFile(filePath, 'utf8')
      return data
    } catch (err) {
      console.error(
        `[LibraryLoader] Failed to read library file as text: ${filePath}`,
        err,
      )
      return null
    }
  }

  async readFile(filePath: string): Promise<Uint8Array | null> {
    const libName = this.resolveLibraryName(filePath)
    if (!libName) return null
    try {
      await this.ensureMounted(libName)
      const data = await zenFs.promises.readFile(filePath)
      return data
    } catch (err) {
      console.error(
        `[LibraryLoader] Failed to read library file: ${filePath}`,
        err,
      )
      return null
    }
  }
}

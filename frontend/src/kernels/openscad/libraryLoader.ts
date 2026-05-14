import { Zip } from '@zenfs/archives'
import { configure, fs, mounts } from '@zenfs/core'

import libsConfig from '../../../openscad-libs-config.json'

// Fast lookup for known library names (first path segment)
const LIBRARY_NAMES = new Set(libsConfig.libraries.map((lib) => lib.name))

// Reverse map: root-level alias → { libName, internalPath }
type SymlinkEntry = { libName: string; internalPath: string }
const SYMLINK_ALIASES = new Map<string, SymlinkEntry>()
for (const lib of libsConfig.libraries) {
  if ('symlinks' in lib && lib.symlinks) {
    for (const [alias, target] of Object.entries(
      lib.symlinks as unknown as Record<string, string>,
    )) {
      SYMLINK_ALIASES.set(alias, { libName: lib.name, internalPath: target })
    }
  }
}

/**
 * Lazily mounts OpenSCAD library ZIPs via zenfs's Zip backend.
 *
 * Each library is mounted once at /libraries/{name} and a directory
 * symlink /{name} → /libraries/{name} is created so OpenSCAD can
 * resolve `include <LibName/file.scad>` paths. Per-library symlink
 * aliases (e.g. smooth_prim.scad) are also created from config.
 *
 * Mounts and symlinks persist across compilations; only the first
 * access per library incurs a network fetch.
 */
export class LibraryLoader {
  // Tracks in-flight mount promises to deduplicate concurrent requests
  private mounting = new Map<string, Promise<void>>()

  /**
   * Returns true if path refers to a known library (by library-name
   * first segment or a configured root-level alias).
   */
  isLibraryPath(path: string): boolean {
    return this.resolveLibraryName(path) !== null
  }

  /** Resolves the library name from a path, or null if not a library. */
  private resolveLibraryName(path: string): string | null {
    const normalized = path.startsWith('/') ? path.slice(1) : path
    const firstSegment = normalized.split('/')[0]

    if (LIBRARY_NAMES.has(firstSegment)) return firstSegment

    // Check configured root-level aliases (e.g. smooth_prim.scad)
    const alias = SYMLINK_ALIASES.get(firstSegment)
    return alias ? alias.libName : null
  }

  private async ensureMounted(libName: string): Promise<void> {
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
    const resp = await fetch(`/libraries/${libName}.zip`)
    if (!resp.ok) {
      throw new Error(
        `[LibraryLoader] Failed to fetch ${libName}.zip: ${resp.status}`,
      )
    }
    const data = await resp.arrayBuffer()

    await configure({ mounts: { [mountPoint]: { backend: Zip, data } } })

    // Primary directory symlink: /{libName} → /libraries/{libName}
    try {
      await fs.promises.symlink(mountPoint, `/${libName}`)
    } catch {
      // symlink already exists from a previous worker invocation
    }

    // Extra root-level aliases defined in config
    const libConfig = libsConfig.libraries.find((l) => l.name === libName)
    if ('symlinks' in libConfig! && libConfig.symlinks) {
      for (const [alias, target] of Object.entries(
        libConfig.symlinks as unknown as Record<string, string>,
      )) {
        try {
          await fs.promises.symlink(`${mountPoint}/${target}`, `/${alias}`)
        } catch {
          // already exists
        }
      }
    }
  }

  async readFileAsText(path: string): Promise<string | null> {
    const libName = this.resolveLibraryName(path)
    if (!libName) return null
    try {
      await this.ensureMounted(libName)
      return await fs.promises.readFile(path, 'utf8')
    } catch {
      return null
    }
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const libName = this.resolveLibraryName(path)
    if (!libName) return null
    try {
      await this.ensureMounted(libName)
      return await fs.promises.readFile(path)
    } catch {
      return null
    }
  }
}

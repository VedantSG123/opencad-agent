import { unzipSync } from 'fflate'

import libsConfig from '../../../openscad-libs-config.json'

const LIBRARY_NAMES = new Set(libsConfig.libraries.map((lib) => lib.name))

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

export class LibraryLoader {
  private cache = new Map<string, Record<string, Uint8Array>>()
  private mounting = new Map<string, Promise<Record<string, Uint8Array>>>()

  isLibraryPath(path: string): boolean {
    return this.resolveLibraryName(path) !== null
  }

  private resolveLibraryName(path: string): string | null {
    const normalized = path.startsWith('/') ? path.slice(1) : path
    const firstSegment = normalized.split('/')[0]

    if (LIBRARY_NAMES.has(firstSegment)) return firstSegment

    const alias = SYMLINK_ALIASES.get(firstSegment)
    return alias ? alias.libName : null
  }

  private async getLibraryFiles(
    libName: string,
  ): Promise<Record<string, Uint8Array>> {
    const cached = this.cache.get(libName)
    if (cached) return cached

    const active = this.mounting.get(libName)
    if (active) return active

    const promise = (async () => {
      const resp = await fetch(`/libraries/${libName}.zip`)
      if (!resp.ok) {
        throw new Error(`Failed to fetch library zip: ${libName}`)
      }
      const buffer = await resp.arrayBuffer()
      const files = unzipSync(new Uint8Array(buffer))
      this.cache.set(libName, files)
      this.mounting.delete(libName)
      return files
    })()

    this.mounting.set(libName, promise)
    return promise
  }

  private getRelativePath(path: string, libName: string): string {
    const normalized = path.startsWith('/') ? path.slice(1) : path
    const parts = normalized.split('/')
    const firstSegment = parts[0]

    const alias = SYMLINK_ALIASES.get(firstSegment)
    if (alias) {
      parts[0] = alias.internalPath
      return parts.join('/')
    }

    if (parts[0] === libName) {
      parts.shift()
    }
    return parts.join('/')
  }

  async readFileAsText(path: string): Promise<string | null> {
    const libName = this.resolveLibraryName(path)
    if (!libName) return null
    try {
      const files = await this.getLibraryFiles(libName)
      const relativePath = this.getRelativePath(path, libName)
      const fileData = files[relativePath]
      if (!fileData) return null
      return new TextDecoder().decode(fileData)
    } catch {
      return null
    }
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const libName = this.resolveLibraryName(path)
    if (!libName) return null
    try {
      const files = await this.getLibraryFiles(libName)
      const relativePath = this.getRelativePath(path, libName)
      return files[relativePath] || null
    } catch {
      return null
    }
  }
}

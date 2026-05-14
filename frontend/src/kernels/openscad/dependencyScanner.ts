/**
 * Utility to scan OpenSCAD code for dependencies.
 *
 * Optimized for browser/WASM execution:
 * - Only mounts required assets into the Emscripten VFS
 * - Recursively resolves .scad dependencies
 * - Ignores comments to avoid false positives
 * - Supports multiline OpenSCAD syntax
 * - Prevents path traversal outside virtual root
 */

const ALLOWED_EXTENSIONS = [
  '.scad',
  '.json',
  '.stl',
  '.obj',
  '.3mf',
  '.amf',
  '.off',
  '.dxf',
  '.svg',
  '.png',
  '.ttf',
  '.otf',
]

/**
 * Checks whether a file extension is allowed.
 */
export function isAllowedExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase()

  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Removes OpenSCAD comments before dependency scanning.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/**
 * Scans a single piece of OpenSCAD code for dependency paths.
 */
function scanDependencies(code: string): string[] {
  const deps = new Set<string>()

  const cleaned = stripComments(code)

  const patterns = [
    // include <file.scad>
    // use <file.scad>
    /(?:include|use)\s*<([^>]+)>/g,

    // import("file.stl")
    // import('file.stl')
    /import\s*\(\s*["']([^"']+)["']/g,

    // surface(file = "heightmap.png")
    // surface("heightmap.png")
    /surface\s*\(\s*(?:[^)]*?\bfile\s*=\s*)?["']([^"']+)["']/gs,

    // Optional custom font references
    // text(font = "Roboto.ttf")
    /font\s*=\s*["']([^"']+\.(?:ttf|otf))["']/gi,
  ]

  for (const regex of patterns) {
    let match: RegExpExecArray | null

    while ((match = regex.exec(cleaned)) !== null) {
      const dep = match[1].trim()

      if (dep.length > 0) {
        deps.add(dep)
      }
    }
  }

  return [...deps]
}

/**
 * Normalizes a path:
 * - Resolves "." and ".."
 * - Prevents traversal outside virtual root
 * - Always returns absolute-style paths
 */
function normalizePath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')

  const result: string[] = []

  for (const part of parts) {
    if (part === '' || part === '.') {
      continue
    }

    if (part === '..') {
      // Prevent escaping virtual root
      if (result.length > 0) {
        result.pop()
      }

      continue
    }

    result.push(part)
  }

  return '/' + result.join('/')
}

/**
 * Resolves a dependency path relative to a base directory.
 */
function resolvePath(baseDir: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return normalizePath(relativePath)
  }

  return normalizePath(`${baseDir}/${relativePath}`)
}

/**
 * Recursively resolves all dependencies starting from a root file.
 *
 * Only allowed file types are included.
 * Only referenced files are traversed/mounted.
 */
export async function resolveProjectDependencies(
  rootCode: string,
  rootPath: string,
  readFile: (path: string) => Promise<string | null>,
): Promise<Set<string>> {
  const resolved = new Set<string>()

  const scanned = new Set<string>()

  const toScan: { code: string; currentPath: string }[] = [
    {
      code: rootCode,
      currentPath: rootPath,
    },
  ]

  const normalizedRoot = normalizePath(rootPath)

  // Always include root file itself
  resolved.add(normalizedRoot)

  while (toScan.length > 0) {
    const current = toScan.pop()

    if (!current) {
      continue
    }

    const { code, currentPath } = current

    const normalizedCurrent = normalizePath(currentPath)

    // Prevent infinite recursion
    if (scanned.has(normalizedCurrent)) {
      continue
    }

    scanned.add(normalizedCurrent)

    const deps = scanDependencies(code)

    const dir = normalizedCurrent.split('/').slice(0, -1).join('/') || '/'

    for (const dep of deps) {
      const absoluteDepPath = resolvePath(dir, dep)

      const normalizedDep = normalizePath(absoluteDepPath)

      // Ignore unsupported extensions
      if (!isAllowedExtension(normalizedDep)) {
        continue
      }

      // Skip duplicates
      if (resolved.has(normalizedDep)) {
        continue
      }

      resolved.add(normalizedDep)

      // Only recursively scan .scad files
      if (normalizedDep.toLowerCase().endsWith('.scad')) {
        try {
          const content = await readFile(normalizedDep)

          if (content !== null) {
            toScan.push({
              code: content,
              currentPath: normalizedDep,
            })
          }
        } catch {
          // Ignore unreadable dependency files
        }
      }
    }
  }

  return resolved
}

import path from 'node:path'

/** True when `target` is `parent` itself or sits underneath it. */
export function isWithin(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target))
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

/**
 * The directory holding a path, treating an extension-less path as a directory
 * in its own right: `/lib/parts.scad` gives `/lib`, `/lib/parts` gives itself.
 */
export function containingDirectory(target: string): string {
  const resolved = path.resolve(target)
  return path.extname(resolved) === '' ? resolved : path.dirname(resolved)
}

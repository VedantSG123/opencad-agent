import fs from 'node:fs'
import path from 'node:path'

const SOURCE_ROOT = path.resolve(import.meta.dir, '..')

/**
 * Reads a file at build time and inlines its contents as a string literal.
 * Import it with `with { type: 'macro' }`: `bun build --compile` bundles
 * JavaScript only, so a read left in the output would fail in the standalone
 * binary the way a missing asset does.
 *
 * Paths are relative to `backend/src`, because a relative path inside a macro
 * resolves against the build's working directory rather than the file that
 * imported it.
 */
export function inlineFile(sourceRelativePath: string): string {
  return fs.readFileSync(path.join(SOURCE_ROOT, sourceRelativePath), 'utf8')
}

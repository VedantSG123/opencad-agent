import fs from 'node:fs'
import path from 'node:path'

const FRONTEND_DIR = path.resolve(import.meta.dir, '../../../../../frontend')

export type LibrarySource = {
  version: string
  /** File contents keyed by their path inside the library directory. */
  files: Record<string, string>
}

/**
 * Collects the replicad package the frontend's worker runs, at build time.
 * Import it with `with { type: 'macro' }`, as `inlineFile` is: the standalone
 * binary has no node_modules to read it from.
 *
 * The npm package ships a bundle, not its sources, so the original TypeScript
 * is taken from the source map, which carries every file's contents.
 */
export function replicadLibrarySource(): LibrarySource {
  // Resolved from the frontend rather than the backend, so the files are those
  // of the version the user's models actually run against.
  const entry = Bun.resolveSync('replicad', FRONTEND_DIR)
  const root = path.resolve(path.dirname(entry), '..')
  const read = (relative: string) =>
    fs.readFileSync(path.join(root, relative), 'utf8')

  const manifest = JSON.parse(read('package.json')) as {
    name: string
    version: string
    description: string
    license: string
  }

  const files: Record<string, string> = {
    'package.json': `${JSON.stringify(
      {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        license: manifest.license,
        types: './replicad.d.ts',
      },
      null,
      2,
    )}\n`,
    'README.md': read('README.md'),
    LICENSE: read('LICENSE'),
    'replicad.d.ts': read('dist/replicad.d.ts'),
  }

  const map = JSON.parse(read('dist/replicad.js.map')) as {
    sources: string[]
    sourcesContent: (string | null)[]
  }
  map.sources.forEach((source, index) => {
    const content = map.sourcesContent[index]
    // Bundled dependencies (opentype.js, flatbush) appear as paths into the
    // build machine's node_modules; only replicad's own sources start here.
    if (!source.startsWith('../src/') || content == null) return
    files[source.slice('../'.length)] = content
  })

  return { version: manifest.version, files }
}

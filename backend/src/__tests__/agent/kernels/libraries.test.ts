import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { kernelLibrary } from '../../../agent/kernels'
import { LIBRARIES_DIR } from '../../../agent/kernels/libraries/directory'
import { installLibrary } from '../../../agent/kernels/libraries/install'
import { replicadLibrarySource } from '../../../agent/kernels/libraries/replicadSource'
import { evaluateAccess } from '../../../agent/permissions/evaluate'
import { createPathGuard } from '../../../agent/permissions/pathGuard'
import { buildSystemPrompt } from '../../../agent/prompt/system'
import type { SupportedCADKernels } from '../../../cad'
import type { Project } from '../../../project/schema'

const FRONTEND = path.resolve(import.meta.dir, '../../../../../frontend')

describe('the replicad library', () => {
  const source = replicadLibrarySource()

  test('is the version the frontend worker runs', async () => {
    const entry = Bun.resolveSync('replicad', FRONTEND)
    const manifest = JSON.parse(
      await readFile(
        path.resolve(path.dirname(entry), '../package.json'),
        'utf-8',
      ),
    ) as { version: string }

    expect(source.version).toBe(manifest.version)
  })

  test('carries the documented API and the original sources', () => {
    expect(source.files['replicad.d.ts']).toContain(
      'export declare function draw(initialPoint?: Point2D): DrawingPen;',
    )
    expect(source.files['src/draw.ts']).toContain('export')
    expect(source.files['README.md']).toContain('The open cascade bottle')
  })

  test('leaves out the dependencies bundled into it', () => {
    const outside = Object.keys(source.files).filter(
      (name) => name.includes('node_modules') || name.startsWith('..'),
    )
    expect(outside).toEqual([])
  })
})

describe('installing a library', () => {
  let base = ''
  let target = ''

  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'library-test-'))
    target = path.join(base, 'demo-1.0.0')
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true })
  })

  test('writes every file, nested ones included', async () => {
    await installLibrary(target, { 'a.d.ts': 'A', 'src/b/c.ts': 'C' })

    expect(await readFile(path.join(target, 'a.d.ts'), 'utf-8')).toBe('A')
    expect(await readFile(path.join(target, 'src/b/c.ts'), 'utf-8')).toBe('C')
  })

  test('leaves a finished install alone', async () => {
    await installLibrary(target, { 'a.d.ts': 'A' })
    await writeFile(path.join(target, 'a.d.ts'), 'changed')

    await installLibrary(target, { 'a.d.ts': 'A' })

    expect(await readFile(path.join(target, 'a.d.ts'), 'utf-8')).toBe('changed')
  })

  test('replaces a half-finished one', async () => {
    await mkdir(target)
    await writeFile(path.join(target, 'stale.ts'), 'left behind')

    await installLibrary(target, { 'a.d.ts': 'A' })

    expect(await readFile(path.join(target, 'a.d.ts'), 'utf-8')).toBe('A')
    const leftOver = await stat(path.join(target, 'stale.ts')).then(
      () => true,
      () => false,
    )
    expect(leftOver).toBe(false)
  })
})

describe('the agent and the library directory', () => {
  const guard = createPathGuard({
    tool: '*',
    projectDirectory: '/projects/demo',
    sessionId: 'ses_test',
    currentRules: () => [],
  })
  const file = path.join(LIBRARIES_DIR, 'replicad-0.20.5', 'replicad.d.ts')

  test('reads it without asking', () => {
    expect(guard.refusalFor(file, 'read')).toBeNull()
  })

  test('cannot write it, and is told why', () => {
    expect(guard.refusalFor(file, 'write')).toBe(
      `${file} cannot be accessed: it is a library the app installs for reference, and is read-only.`,
    )
  })

  test('is refused a write before the call runs, with the same reason', async () => {
    const verdict = await evaluateAccess(
      { kind: 'path', path: file, access: 'write' },
      { tool: 'create', projectDirectory: '/projects/demo', rules: [] },
    )

    expect(verdict).toMatchObject({
      decision: 'deny',
      reason:
        'it is a library the app installs for reference, and is read-only',
    })
  })

  test('is pointed at it only for a kernel that has one', () => {
    const replicad = kernelLibrary('replicad')
    expect(replicad?.directory.startsWith(LIBRARIES_DIR)).toBe(true)

    expect(buildSystemPrompt(project('replicad'))).toContain(
      `- replicad ${replicad?.version} source, read-only: ${replicad?.directory}`,
    )
    expect(buildSystemPrompt(project('openscad'))).not.toContain(LIBRARIES_DIR)
  })
})

function project(kernel: SupportedCADKernels): Project {
  return {
    id: 'prj_test',
    name: 'Test',
    cad_kernel: kernel,
    directory: '/projects/demo',
    file: null,
    preferences: { permissions: { rules: [] } },
    time: { created: 'now', updated: 'now', accessed: null },
  }
}

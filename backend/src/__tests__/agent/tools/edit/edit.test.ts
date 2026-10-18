import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { PermissionAccess } from 'shared'

import { createPathGuard } from '../../../../agent/permissions/pathGuard'
import type { PathGuard } from '../../../../agent/permissions/pathGuard'
import { buildRule } from '../../../../agent/permissions/rules/buildRule'
import { edit } from '../../../../agent/tools/edit'
import type { ToolContext } from '../../../../agent/tools/types'

const SESSION = 'ses_edit_test'

const SAMPLE = `export function makeCylinder(radius, height) {
  const base = circle(radius)
  return base.extrude(height)
}
`

let root = ''

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'edit-test-'))
  await writeFile(path.join(root, 'parts.js'), SAMPLE, 'utf-8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function block(startLine: number, search: string, replace: string): string {
  return `<<<<<<< SEARCH
:start_line:${startLine}
-------
${search}
=======
${replace}
>>>>>>> REPLACE
`
}

/** A guard for the temp project that also allows `granted`, if given. */
function guardAllowing(granted?: string, access: PermissionAccess = 'write') {
  const rules = granted
    ? [
        buildRule(
          { tool: '*', match: { kind: 'pathPrefix', path: granted, access } },
          'perm_1',
          '2026-08-09T00:00:00.000Z',
        ),
      ]
    : []

  return createPathGuard({
    tool: 'edit',
    projectDirectory: root,
    sessionId: SESSION,
    currentRules: () => rules,
  })
}

function contextWith(permissions?: PathGuard): ToolContext {
  return { workingDirectory: root, permissions }
}

async function runEdit(
  input: { path: string; diff: string },
  permissions?: PathGuard,
): Promise<string> {
  return edit(input, contextWith(permissions), undefined)
}

function readSample(name = 'parts.js'): Promise<string> {
  return readFile(path.join(root, name), 'utf-8')
}

describe('edit tool', () => {
  describe('applying blocks', () => {
    test('writes a single replacement to the file', async () => {
      const result = await runEdit({
        path: 'parts.js',
        diff: block(
          2,
          '  const base = circle(radius)',
          '  const base = rect(radius)',
        ),
      })

      expect(result).toContain('Edited parts.js')
      expect(result).toContain('applied 1 of 1 block')
      expect(await readSample()).toContain('const base = rect(radius)')
    })

    test('applies several blocks in one call', async () => {
      const diff =
        block(
          1,
          'export function makeCylinder(radius, height) {',
          'export function makeTube(radius, height) {',
        ) +
        '\n' +
        block(
          3,
          '  return base.extrude(height)',
          '  return base.extrude(height * 2)',
        )

      const result = await runEdit({ path: 'parts.js', diff })

      expect(result).toContain('applied 2 of 2 blocks')

      const written = await readSample()
      expect(written).toContain('export function makeTube(radius, height) {')
      expect(written).toContain('return base.extrude(height * 2)')
    })

    test('finds content that has shifted away from the stated line', async () => {
      const result = await runEdit({
        path: 'parts.js',
        diff: block(
          1,
          '  return base.extrude(height)',
          '  return base.extrude(height + 1)',
        ),
      })

      expect(result).toContain('applied 1 of 1 block')
      expect(await readSample()).toContain('height + 1')
    })

    test('preserves CRLF line endings', async () => {
      await writeFile(
        path.join(root, 'crlf.js'),
        SAMPLE.replace(/\n/g, '\r\n'),
        'utf-8',
      )

      await runEdit({
        path: 'crlf.js',
        diff: block(
          2,
          '  const base = circle(radius)',
          '  const base = rect(radius)',
        ),
      })

      const written = await readSample('crlf.js')
      expect(written).toContain('\r\n')
      expect(written).not.toMatch(/[^\r]\n/)
    })

    test('rebases the replacement onto the indentation in the file', async () => {
      const result = await runEdit({
        path: 'parts.js',
        diff: block(
          2,
          'const base = circle(radius)',
          'const base = rect(radius)',
        ),
      })

      expect(result).toContain('applied 1 of 1 block')
      expect(await readSample()).toContain('\n  const base = rect(radius)')
    })
  })

  describe('blocks that do not match', () => {
    test('writes the blocks that matched and reports the one that did not', async () => {
      const diff =
        block(
          2,
          '  const base = circle(radius)',
          '  const base = rect(radius)',
        ) +
        '\n' +
        block(3, '  return somethingElse()', '  return nothing()')

      const result = await runEdit({ path: 'parts.js', diff })

      expect(result).toContain('applied 1 of 2 blocks')
      expect(result).toContain('No sufficiently good match found')
      expect(await readSample()).toContain('const base = rect(radius)')
    })

    test('leaves the file alone when nothing matches', async () => {
      const result = await runEdit({
        path: 'parts.js',
        diff: block(
          2,
          '  const base = sphere(radius)',
          '  const base = rect(radius)',
        ),
      })

      expect(result).toContain('no changes were made')
      expect(await readSample()).toBe(SAMPLE)
    })

    test('refuses a replacement identical to the search', async () => {
      const line = '  const base = circle(radius)'
      const result = await runEdit({
        path: 'parts.js',
        diff: block(2, line, line),
      })

      expect(result).toContain('no changes were made')
      expect(result).toContain('identical')
      expect(await readSample()).toBe(SAMPLE)
    })
  })

  describe('malformed input', () => {
    test('reports an unterminated block without touching the file', async () => {
      const result = await runEdit({
        path: 'parts.js',
        diff: '<<<<<<< SEARCH\n:start_line:2\n-------\nsomething\n',
      })

      expect(result).toContain('invalid or incomplete')
      expect(await readSample()).toBe(SAMPLE)
    })

    test('reports a diff carrying no blocks at all', async () => {
      const result = await runEdit({
        path: 'parts.js',
        diff: 'just some prose',
      })
      expect(result).toContain('No valid replacements')
    })

    test('reports a missing file rather than creating it', async () => {
      const result = await runEdit({
        path: 'absent.js',
        diff: block(1, 'a', 'b'),
      })

      expect(result).toContain('file not found')
      expect(result).toContain('use create to make a new one')
    })
  })

  describe('permissions', () => {
    test('refuses a path outside the project', async () => {
      const result = await runEdit(
        { path: '../escape.js', diff: block(1, 'a', 'b') },
        guardAllowing(),
      )

      expect(result).toContain('outside the project directory')
      expect(result).toContain('write')
    })

    test('refuses a built-in denial even inside the project', async () => {
      await writeFile(path.join(root, '.env'), 'SECRET=1\n', 'utf-8')

      const result = await runEdit(
        { path: '.env', diff: block(1, 'SECRET=1', 'SECRET=2') },
        guardAllowing(),
      )

      expect(result).toContain('cannot be accessed')
      expect(await readSample('.env')).toBe('SECRET=1\n')
    })

    test('a read grant does not authorise an edit', async () => {
      const outside = await mkdtemp(path.join(tmpdir(), 'edit-outside-'))
      await writeFile(path.join(outside, 'lib.js'), SAMPLE, 'utf-8')

      try {
        const target = path.join(outside, 'lib.js')
        const readOnly = await runEdit(
          {
            path: target,
            diff: block(
              2,
              '  const base = circle(radius)',
              '  const base = rect(radius)',
            ),
          },
          guardAllowing(outside, 'read'),
        )
        expect(readOnly).toContain('has not been approved for write access')

        const writable = await runEdit(
          {
            path: target,
            diff: block(
              2,
              '  const base = circle(radius)',
              '  const base = rect(radius)',
            ),
          },
          guardAllowing(outside, 'write'),
        )
        expect(writable).toContain('applied 1 of 1 block')
      } finally {
        await rm(outside, { recursive: true, force: true })
      }
    })
  })
})

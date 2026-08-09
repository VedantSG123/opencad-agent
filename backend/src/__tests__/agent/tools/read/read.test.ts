import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createPathGuard } from '../../../../agent/permissions/pathGuard'
import type { PathGuard } from '../../../../agent/permissions/pathGuard'
import { buildRule } from '../../../../agent/permissions/rules/buildRule'
import {
  clearOnceGrants,
  grantOnce,
} from '../../../../agent/permissions/rules/onceGrants'
import { read } from '../../../../agent/tools/read'
import type { ReadInput } from '../../../../agent/tools/read'
import { readWindow } from '../../../../agent/tools/read/readWindow'
import type { ToolContext } from '../../../../agent/tools/types'

const RESOURCE_DIR = path.join(import.meta.dir, '../../../resource/readSample')
const SESSION = 'ses_read_test'

const context: ToolContext = {
  workingDirectory: RESOURCE_DIR,
}

/** A guard for this project that also allows `granted`, if given. */
function guardAllowing(granted?: string): PathGuard {
  const rules = granted
    ? [
        buildRule(
          {
            tool: '*',
            match: { kind: 'pathPrefix', path: granted, access: 'read' },
          },
          'perm_1',
          '2026-08-09T00:00:00.000Z',
        ),
      ]
    : []

  return createPathGuard({
    tool: 'read',
    projectDirectory: RESOURCE_DIR,
    sessionId: SESSION,
    currentRules: () => rules,
  })
}

afterEach(() => {
  clearOnceGrants(SESSION)
})

async function runRead(input: ReadInput): Promise<string> {
  return read(input, context, undefined)
}

describe('read tool', () => {
  describe('whole files', () => {
    test('returns numbered lines with a header', async () => {
      const result = await runRead({ path: 'lib/geometry.js' })
      expect(result).toContain('File: lib/geometry.js')
      expect(result).toContain('Lines 1-7 of 7')
      expect(result).toContain(
        '1 | export function makeCylinder(radius, height) {',
      )
      expect(result).toContain('7 | }')
      expect(result).not.toContain('The file continues')
    })

    test('keeps a last line that has no trailing newline', async () => {
      const result = await runRead({ path: 'noTrailingNewline.txt' })
      expect(result).toContain('Lines 1-3 of 3')
      expect(result).toContain('3 | gamma')
    })

    test('strips carriage returns from CRLF files', async () => {
      // Guards the fixture itself: git's `text=auto eol=lf` would flatten it to
      // LF and leave the assertions below passing while proving nothing.
      const raw = await readFile(path.join(RESOURCE_DIR, 'crlf.txt'))
      expect(raw.includes('\r\n')).toBe(true)

      const result = await runRead({ path: 'crlf.txt' })
      expect(result).toContain('Lines 1-3 of 3')
      expect(result).toContain('1 | first line\n2 | second line')
    })

    test('reports an empty file instead of an empty listing', async () => {
      const result = await runRead({ path: 'empty.txt' })
      expect(result).toBe('empty.txt is empty.')
    })
  })

  describe('windowing', () => {
    test('stops at the default line limit and suggests the next offset', async () => {
      const result = await runRead({ path: 'pages.txt' })
      expect(result).toContain('Lines 1-500 (')
      expect(result).toContain('500 | line 500')
      expect(result).not.toContain('501 | line 501')
      expect(result).toContain(
        '[The file continues past line 500. Read on with { "path": "pages.txt", "offset": 501 }.]',
      )
    })

    test('honours offset and limit', async () => {
      const result = await runRead({ path: 'pages.txt', offset: 100, limit: 3 })
      expect(result).toContain('Lines 100-102')
      expect(result).toContain('100 | line 100')
      expect(result).toContain('102 | line 102')
      expect(result).not.toContain('103 | line 103')
    })

    test('reports the total once the end of the file is reached', async () => {
      const result = await runRead({ path: 'pages.txt', offset: 1198 })
      expect(result).toContain('Lines 1198-1200 of 1200')
      expect(result).toContain('1200 | line 1200')
      expect(result).not.toContain('The file continues')
    })

    test('does not claim more lines when the limit matches the file exactly', async () => {
      const result = await runRead({ path: 'pages.txt', limit: 1200 })
      expect(result).toContain('Lines 1-1200 of 1200')
      expect(result).not.toContain('The file continues')
    })

    test('rejects an offset past the end of the file', async () => {
      const result = await runRead({ path: 'pages.txt', offset: 5000 })
      expect(result).toBe(
        'Error: offset 5000 is past the end of pages.txt, which has 1200 lines.',
      )
    })

    test('keeps multi-byte characters intact across chunk boundaries', async () => {
      const result = await runRead({
        path: 'unicode.txt',
        offset: 2999,
        limit: 2,
      })
      expect(result).toContain('2999 | line 2999: resumé 日本語 ✅ 🚀')
      expect(result).toContain('3000 | line 3000: resumé 日本語 ✅ 🚀')
      expect(result).not.toContain('�')
    })
  })

  describe('output budgets', () => {
    test('clips very long lines and says how many', async () => {
      const result = await runRead({ path: 'wideLine.txt' })
      expect(result).toContain('1 | ' + 'x'.repeat(2000) + '\n')
      expect(result).not.toContain('x'.repeat(2001))
      expect(result).toContain('2 | short tail line')
      expect(result).toContain('[1 line was clipped at 2000 characters.]')
    })

    test('stops at the character budget before the requested line count', async () => {
      const result = await runRead({ path: 'bigLines.txt', limit: 100 })
      expect(result).toContain('character output budget')
      expect(result).toContain('The file continues past line')
      expect(result).not.toContain('100 | line 100')
    })

    test('gives up rather than scanning without bound to reach an offset', async () => {
      const window = await readWindow({
        absolutePath: path.join(RESOURCE_DIR, 'unicode.txt'),
        offset: 2900,
        limit: 10,
        maxLineChars: 2000,
        maxOutputChars: 60_000,
        maxScanBytes: 64 * 1024,
        abortSignal: undefined,
      })
      expect(window.lines).toHaveLength(0)
      expect(window.stoppedAtScanBudget).toBe(true)
      expect(window.totalLines).toBeNull()
    })
  })

  describe('unreadable files', () => {
    test('refuses known binary extensions', async () => {
      const result = await runRead({ path: 'logo.png' })
      expect(result).toBe(
        'Error: logo.png is a binary file (".png") and cannot be read as text.',
      )
    })

    test('refuses files containing null bytes', async () => {
      const result = await runRead({ path: 'blob.dat' })
      expect(result).toContain('contains null bytes')
    })

    // The name the model asked for is harmless; only the resolved path shows
    // that it lands on a file the policy blocks outright.
    test('refuses a symlink whose target is blocked by name', async () => {
      const base = await realpath(
        await mkdtemp(path.join(tmpdir(), 'opencad-read-')),
      )
      await writeFile(path.join(base, '.env'), 'API_KEY=secret\n')
      await symlink(path.join(base, '.env'), path.join(base, 'notes.txt'))

      try {
        const result = await read(
          { path: 'notes.txt' },
          { workingDirectory: base },
          undefined,
        )
        expect(result).toContain('cannot be accessed')
        expect(result).not.toContain('API_KEY')
      } finally {
        await rm(base, { recursive: true, force: true })
      }
    })

    test('refuses a directory and points at grep', async () => {
      const result = await runRead({ path: 'lib' })
      expect(result).toBe(
        'Error: lib is a directory, not a file. Use grep to search inside it.',
      )
    })
  })

  describe('path handling', () => {
    test('reports a missing file', async () => {
      const result = await runRead({ path: 'does/not/exist.js' })
      expect(result).toBe('Error: file not found: does/not/exist.js')
    })

    test('rejects paths outside the project', async () => {
      const result = await runRead({ path: '../grepSample/index.js' })
      expect(result).toContain('is outside the project directory')
    })

    test('rejects a symlink that escapes the project', async () => {
      const result = await runRead({ path: 'escape.js' })
      expect(result).toContain('is outside the project directory')
    })

    test('reads outside the project once the directory is granted', async () => {
      const granted = path.join(RESOURCE_DIR, '../grepSample')
      const result = await read(
        { path: '../grepSample/index.js' },
        { workingDirectory: RESOURCE_DIR, permissions: guardAllowing(granted) },
        undefined,
      )
      expect(result).toContain(`File: ${path.join(granted, 'index.js')}`)
      expect(result).toContain('makeCylinder')
    })

    test('follows a symlink into a granted directory', async () => {
      const result = await read(
        { path: 'escape.js' },
        {
          workingDirectory: RESOURCE_DIR,
          permissions: guardAllowing(path.join(RESOURCE_DIR, '../grepSample')),
        },
        undefined,
      )
      expect(result).toContain('makeCylinder')
    })

    test('a granted directory does not open up its neighbours', async () => {
      const result = await read(
        { path: '../grepSample/index.js' },
        {
          workingDirectory: RESOURCE_DIR,
          permissions: guardAllowing(
            path.join(RESOURCE_DIR, '../grepSample/lib'),
          ),
        },
        undefined,
      )
      expect(result).toContain('has not been approved for read access')
    })

    test('reads a file warranted by an allow-once for this very call', async () => {
      const target = path.join(RESOURCE_DIR, '../grepSample/index.js')
      grantOnce(SESSION, 'call_1', [path.resolve(target)])

      const context = {
        workingDirectory: RESOURCE_DIR,
        permissions: guardAllowing(),
      }

      expect(
        await read({ path: target }, context, undefined, 'call_1'),
      ).toContain('makeCylinder')
      // Another call in the same session is not covered by that warrant.
      expect(
        await read({ path: target }, context, undefined, 'call_2'),
      ).toContain('has not been approved for read access')
    })

    test('accepts an absolute path inside the project', async () => {
      const result = await runRead({
        path: path.join(RESOURCE_DIR, 'crlf.txt'),
      })
      expect(result).toContain('File: crlf.txt')
    })

    test('reports a missing project directory', async () => {
      const result = await read(
        { path: 'crlf.txt' },
        { workingDirectory: path.join(RESOURCE_DIR, 'doesNotExist') },
        undefined,
      )
      expect(result).toContain('does not exist or is not a directory.')
    })
  })
})

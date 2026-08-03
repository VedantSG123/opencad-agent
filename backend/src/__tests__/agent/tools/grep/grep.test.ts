import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { grep } from '../../../../agent/tools/grep'
import type { GrepInput } from '../../../../agent/tools/grep'
import type { ToolContext } from '../../../../agent/tools/types'

const RESOURCE_DIR = path.join(import.meta.dir, '../../../resource/grepSample')

const context: ToolContext = {
  workingDirectory: RESOURCE_DIR,
}

async function runGrep(input: GrepInput): Promise<string> {
  return grep(input, context, undefined)
}

describe('grep tool', () => {
  describe('filesWithMatches (default output mode)', () => {
    test('lists matching files with forward-slash relative paths', async () => {
      const result = await runGrep({ pattern: 'makeCylinder' })
      expect(result).toContain('Found 4 files with matches.')
      expect(result).toContain('index.js')
      expect(result).toContain('lib/geometry.js')
      expect(result).toContain('notes.txt')
      expect(result).toContain('README.md')
      expect(result).not.toContain('\\')
    })

    test('skips hidden files and ignore-file-excluded files by default', async () => {
      const result = await runGrep({ pattern: 'IGNORED_TOKEN' })
      expect(result).toContain('No matches found')
      expect(result).not.toContain('vendor')

      const hidden = await runGrep({ pattern: 'HIDDEN_TOKEN' })
      expect(hidden).toContain('No matches found')
      expect(hidden).not.toContain('.hidden.js')
    })

    test('respects the headLimit footer', async () => {
      const result = await runGrep({ pattern: 'makeCylinder', headLimit: 2 })
      expect(result).toContain('Showing first 2 of 4 files.')
    })
  })

  describe('content mode', () => {
    test('renders line-numbered matches across files', async () => {
      const result = await runGrep({
        pattern: 'makeCylinder',
        outputMode: 'content',
      })
      expect(result).toContain('Found 6 matches in 4 files.')
      expect(result).toContain(
        "4:import { makeCylinder } from './lib/geometry'",
      )
      expect(result).toContain('12:  const cylinder = makeCylinder(5, 2)')
      expect(result).toContain(
        '1:export function makeCylinder(radius, height) {',
      )
    })

    test('honours contextLines with a "-" separator', async () => {
      const result = await runGrep({
        pattern: 'makeCylinder',
        path: 'lib/geometry.js',
        outputMode: 'content',
        contextLines: 1,
      })
      expect(result).toContain(
        '1:export function makeCylinder(radius, height) {',
      )
      expect(result).toContain(
        "2-  return { radius, height, kind: 'cylinder' }",
      )
    })

    test('supports multiline patterns', async () => {
      const result = await runGrep({
        pattern: 'cube_holder\\(\\) \\{\n  cube\\(',
        outputMode: 'content',
        multiline: true,
      })
      expect(result).toContain('Found 1 match in 1 file.')
      expect(result).toContain('4:module cube_holder() {')
      expect(result).toContain('5:  cube([10, 10, 10]);')
    })

    test('matches case-insensitively when requested', async () => {
      const result = await runGrep({
        pattern: 'MAKECYLINDER',
        outputMode: 'content',
        caseInsensitive: true,
      })
      expect(result).toContain('Found 6 matches in 4 files.')
    })

    test('treats the pattern as a regex, so metacharacters must be escaped', async () => {
      const result = await runGrep({
        pattern: 'makeCylinder\\(',
        outputMode: 'content',
      })
      expect(result).toContain('Found 2 matches in 2 files.')
      expect(result).not.toContain('4:import')
    })

    test('applies the headLimit footer', async () => {
      const result = await runGrep({
        pattern: 'makeCylinder',
        outputMode: 'content',
        headLimit: 3,
      })
      expect(result).toContain(
        '[Output limited to 3 lines across 2 of 4 files.',
      )
    })
  })

  describe('count mode', () => {
    test('reports matching lines per file', async () => {
      const result = await runGrep({
        pattern: 'makeCylinder',
        outputMode: 'count',
      })
      expect(result).toContain('Found 6 matching lines in 4 files.')
      expect(result).toContain('index.js: 2')
      expect(result).toContain('lib/geometry.js: 1')
      expect(result).toContain('notes.txt: 2')
      expect(result).toContain('README.md: 1')
    })

    test('respects case-insensitive matching', async () => {
      const result = await runGrep({
        pattern: 'makebox',
        outputMode: 'count',
        caseInsensitive: true,
      })
      expect(result).toContain('Found 4 matching lines in 3 files.')
      expect(result).toContain('index.js: 2')
      expect(result).toContain('lib/utils.js: 1')
      expect(result).toContain('README.md: 1')
    })
  })

  describe('filters', () => {
    test('glob restricts the search', async () => {
      const result = await runGrep({ pattern: 'makeBox', glob: 'lib/*.js' })
      expect(result).toContain('Found 1 file with matches.')
      expect(result).toContain('lib/utils.js')
      expect(result).not.toContain('index.js')
    })

    test('type filter restricts the search', async () => {
      const result = await runGrep({ pattern: 'makeBox', type: 'js' })
      expect(result).toContain('Found 2 files with matches.')
      expect(result).toContain('index.js')
      expect(result).toContain('lib/utils.js')
    })

    test('glob can target a different extension', async () => {
      const result = await runGrep({
        pattern: 'PLATE_THICKNESS',
        glob: '*.scad',
      })
      expect(result).toContain('Found 1 file with matches.')
      expect(result).toContain('shapes.scad')
    })

    test('path narrows to a directory', async () => {
      const result = await runGrep({ pattern: 'makeCylinder', path: 'lib' })
      expect(result).toContain('Found 1 file with matches.')
      expect(result).toContain('lib/geometry.js')
    })

    test('path narrows to a single file', async () => {
      const result = await runGrep({
        pattern: 'makeCylinder',
        path: 'lib/geometry.js',
        outputMode: 'count',
      })
      expect(result).toContain('Found 1 matching line in 1 file.')
    })
  })

  describe('includeIgnored', () => {
    test('finds ignored files when enabled', async () => {
      const result = await runGrep({
        pattern: 'IGNORED_TOKEN',
        includeIgnored: true,
      })
      expect(result).toContain('Found 1 file with matches.')
      expect(result).toContain('vendor/dep/index.js')
    })

    test('finds hidden files when enabled', async () => {
      const result = await runGrep({
        pattern: 'HIDDEN_TOKEN',
        includeIgnored: true,
      })
      expect(result).toContain('Found 1 file with matches.')
      expect(result).toContain('.hidden.js')
    })
  })

  describe('error handling', () => {
    test('rejects paths outside the project', async () => {
      const result = await runGrep({ pattern: 'x', path: '../outside' })
      expect(result).toContain(
        'is outside the project directory. Only paths inside the project can be searched.',
      )
    })

    test('reports a missing search path', async () => {
      const result = await runGrep({ pattern: 'x', path: 'does/not/exist' })
      expect(result).toContain('Error: path not found: does/not/exist')
    })

    test('reports a missing project directory', async () => {
      const result = await grep(
        { pattern: 'x' },
        { workingDirectory: path.join(RESOURCE_DIR, 'doesNotExist') },
        undefined,
      )
      expect(result).toContain('does not exist or is not a directory.')
    })

    test('suggests includeIgnored when nothing matches', async () => {
      const result = await runGrep({ pattern: 'zzz_nothing' })
      expect(result).toContain('No matches found')
      expect(result).toContain('retry with `includeIgnored: true`')
    })
  })
})

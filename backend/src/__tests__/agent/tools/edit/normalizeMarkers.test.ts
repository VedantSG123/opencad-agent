import { describe, expect, test } from 'bun:test'

import { normalizeMarkers } from '../../../../agent/tools/edit/normalizeMarkers'
import { parseReplacements } from '../../../../agent/tools/edit/parseReplacements'
import { validateDiffBlock } from '../../../../agent/tools/edit/validateDiffBlock'

function accepts(diff: string) {
  const normalized = normalizeMarkers(diff)
  return {
    validation: validateDiffBlock(normalized),
    replacements: parseReplacements(normalized),
  }
}

// The five diffs below are the inputs recorded in session
// ses_06339e6e4001XJy5P3LVY6Wns4, where every one of them was rejected and the
// model gave up on `edit` and rewrote the file through the shell instead.
describe('the diffs that stalled a real session', () => {
  test('a closing marker with a trailing </diff> tag', () => {
    const { validation, replacements } = accepts(
      [
        '<<<<<<< SEARCH',
        'title = "नमस्ते";',
        '=======',
        'title = "Hello";',
        '>>>>>>> REPLACE</diff>',
      ].join('\n'),
    )

    expect(validation.success).toBe(true)
    expect(replacements).toHaveLength(1)
    expect(replacements[0].searchContent).toBe('title = "नमस्ते";')
    expect(replacements[0].replaceContent).toBe('title = "Hello";')
  })

  test('an opening marker with one bracket too many', () => {
    const { validation, replacements } = accepts(
      [
        '<<<<<<<< SEARCH',
        'title = "नमस्ते";',
        '=======',
        'title = "Hello";',
        '>>>>>>> REPLACE',
      ].join('\n'),
    )

    expect(validation.success).toBe(true)
    expect(replacements).toHaveLength(1)
  })

  test('both deformations at once, with line markers', () => {
    const { validation, replacements } = accepts(
      [
        '<<<<<<<< SEARCH',
        ':start_line:18',
        '-------',
        'title = "नमस्ते";',
        '=======',
        'title = "Hello";',
        '>>>>>>> REPLACE',
      ].join('\n'),
    )

    expect(validation.success).toBe(true)
    expect(replacements).toHaveLength(1)
    expect(replacements[0].startLine).toBe(18)
  })
})

describe('normalizeMarkers', () => {
  test('a diff already in canonical form is untouched', () => {
    const diff = [
      '<<<<<<< SEARCH',
      ':start_line:2',
      '-------',
      'let total = 0;',
      '=======',
      'let sum = 0;',
      '>>>>>>> REPLACE',
    ].join('\n')

    expect(normalizeMarkers(diff)).toBe(diff)
  })

  test('an escaped marker stays escaped, so file content survives', () => {
    const diff = [
      '<<<<<<< SEARCH',
      '\\<<<<<<< SEARCH',
      '\\>>>>>>> REPLACE',
      '=======',
      'clean',
      '>>>>>>> REPLACE',
    ].join('\n')

    const { validation, replacements } = accepts(diff)

    expect(validation.success).toBe(true)
    expect(replacements[0].searchContent).toBe(
      '\\<<<<<<< SEARCH\n\\>>>>>>> REPLACE',
    )
  })

  test('a run of equals signs shorter than the marker is left as content', () => {
    // A Markdown setext heading rule, not a separator.
    expect(normalizeMarkers('=====')).toBe('=====')
    expect(normalizeMarkers('===========')).toBe('=======')
  })

  test('indentation and spacing around a marker are absorbed', () => {
    expect(normalizeMarkers('   <<<<<<<   SEARCH  ')).toBe('<<<<<<< SEARCH')
    expect(normalizeMarkers(': start_line : 12 ')).toBe(':start_line:12')
  })
})

describe('what is still refused', () => {
  test('a marker-shaped content line names both fixes', () => {
    const { validation } = accepts(
      [
        '<<<<<<< SEARCH',
        '>>>>>>>>>>>>>>>>',
        '=======',
        'clean',
        '>>>>>>> REPLACE',
      ].join('\n'),
    )

    expect(validation.success).toBe(false)
    if (validation.success) return
    // The message that stalled the session offered only the escape fix.
    expect(validation.error).toContain('escape it with a leading backslash')
    expect(validation.error).toContain('nothing before or')
  })

  test('a block with no separator is still incomplete', () => {
    const { validation } = accepts(
      ['<<<<<<< SEARCH', 'only a search', '>>>>>>> REPLACE'].join('\n'),
    )

    expect(validation.success).toBe(false)
  })
})

import { describe, expect, test } from 'bun:test'

import { applyReplacements } from '../../../../agent/tools/edit/applyReplacements'

const apply = (original: string, search: string, replace: string) =>
  applyReplacements(original, [
    { startLine: 2, searchContent: search, replaceContent: replace },
  ]).content

// A two-level block in a tab-indented Python file, with a sibling the edit
// leaves alone. Python refuses a block that mixes tabs and spaces, so any
// space the edit introduces here is a TabError, not a cosmetic difference.
const TABBED = [
  'def make():',
  '\twith BuildPart() as part:',
  '\t\tBox(10, 10, 10)',
  '\t\tCylinder(3, 20)',
  '\treturn part',
].join('\n')

describe('reindent into a tab-indented file', () => {
  test('a block the model wrote with spaces lands as tabs', () => {
    const result = apply(
      TABBED,
      '    with BuildPart() as part:\n        Box(10, 10, 10)',
      '    with BuildPart() as part:\n        Box(20, 20, 20)',
    )

    expect(result.split('\n')).toEqual([
      'def make():',
      '\twith BuildPart() as part:',
      '\t\tBox(20, 20, 20)',
      '\t\tCylinder(3, 20)',
      '\treturn part',
    ])
  })

  test('a block copied with tabs from the file keeps its tabs', () => {
    // What a model does when it copies the SEARCH text straight out of a
    // `read` result, which preserves the file's tabs.
    const result = apply(
      TABBED,
      '\twith BuildPart() as part:\n\t\tBox(10, 10, 10)',
      '\twith BuildPart() as part:\n\t\tBox(10, 10, 10)\n\t\tfillet(part.edges(), 1)',
    )

    expect(result.split('\n')).toEqual([
      'def make():',
      '\twith BuildPart() as part:',
      '\t\tBox(10, 10, 10)',
      '\t\tfillet(part.edges(), 1)',
      '\t\tCylinder(3, 20)',
      '\treturn part',
    ])
  })

  test('a line moved out a level loses exactly one tab', () => {
    const result = apply(
      TABBED,
      '        Box(10, 10, 10)\n        Cylinder(3, 20)',
      '        Box(10, 10, 10)\n    shell = part.part',
    )

    expect(result.split('\n')).toEqual([
      'def make():',
      '\twith BuildPart() as part:',
      '\t\tBox(10, 10, 10)',
      '\tshell = part.part',
      '\treturn part',
    ])
  })

  test('nothing the edit writes mixes tabs with spaces', () => {
    const result = apply(
      TABBED,
      '    with BuildPart() as part:\n        Box(10, 10, 10)',
      '    with BuildPart() as part:\n        Box(20, 20, 20)\n        Sphere(4)',
    )

    for (const line of result.split('\n')) {
      expect(line).not.toMatch(/^\t+ /)
    }
  })
})

describe('reindent into a space-indented file', () => {
  test('a block the model wrote with tabs lands as the file’s spaces', () => {
    const spaced = [
      'def make():',
      '    with BuildPart() as part:',
      '        Box(10, 10, 10)',
      '    return part',
    ].join('\n')

    const result = apply(
      spaced,
      '\twith BuildPart() as part:\n\t\tBox(10, 10, 10)',
      '\twith BuildPart() as part:\n\t\tBox(20, 20, 20)',
    )

    expect(result.split('\n')).toEqual([
      'def make():',
      '    with BuildPart() as part:',
      '        Box(20, 20, 20)',
      '    return part',
    ])
  })

  test('spaces into spaces stays exact, so off-grid alignment survives', () => {
    // The ` * ` of a JSDoc block sits one column right of its opener. A
    // reindent that rounded to whole levels would pull it back into the
    // margin and break every doc comment it touched.
    const js = [
      'export function a() {',
      '  /**',
      '   * Old.',
      '   */',
      '  return 1',
      '}',
    ].join('\n')

    const result = apply(
      js,
      '  /**\n   * Old.\n   */',
      '  /**\n   * New.\n   */',
    )

    expect(result.split('\n')).toEqual([
      'export function a() {',
      '  /**',
      '   * New.',
      '   */',
      '  return 1',
      '}',
    ])
  })
})

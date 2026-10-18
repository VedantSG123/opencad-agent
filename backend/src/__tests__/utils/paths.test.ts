import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { containingDirectory, isWithin } from '../../utils/paths'

const WINDOWS = process.platform === 'win32'

/**
 * Containment is what every path rule is decided by, so the ways a path can be
 * written differently while naming the same place are pinned here rather than
 * left to `path.relative` staying as it is.
 */
describe('isWithin', () => {
  test('holds for a directory and itself', () => {
    expect(isWithin('/projects/demo', '/projects/demo')).toBe(true)
  })

  test('holds for anything underneath', () => {
    expect(isWithin('/projects/demo', '/projects/demo/lib/a.scad')).toBe(true)
  })

  test('does not hold for a sibling that merely shares a prefix', () => {
    expect(isWithin('/projects/demo', '/projects/demo-other/a.scad')).toBe(
      false,
    )
  })

  test('does not hold for a path that climbs out', () => {
    expect(isWithin('/projects/demo', '/projects/demo/../other')).toBe(false)
  })

  test('normalises a path before judging it', () => {
    expect(isWithin('/projects/demo', '/projects/demo/lib/../a.scad')).toBe(
      true,
    )
  })

  // Windows opens `C:\Projects` and `C:\projects` as one directory, so a rule
  // recorded under one spelling has to cover the other.
  test.skipIf(!WINDOWS)('ignores case on Windows', () => {
    expect(isWithin('C:/Projects/demo', 'C:/projects/DEMO/a.scad')).toBe(true)
  })

  test.skipIf(!WINDOWS)('accepts either separator on Windows', () => {
    expect(
      isWithin('C:/Projects/demo', String.raw`C:\Projects\demo\a.scad`),
    ).toBe(true)
  })

  test.skipIf(!WINDOWS)('does not hold across drives', () => {
    expect(isWithin('C:/Projects/demo', 'D:/Projects/demo/a.scad')).toBe(false)
  })
})

describe('containingDirectory', () => {
  test('gives the holding directory for a file', () => {
    expect(containingDirectory('/lib/parts.scad')).toBe(path.resolve('/lib'))
  })

  // An extension-less path is a directory in its own right, so a grant made
  // from one covers what is inside it rather than what is beside it.
  test('gives an extension-less path back unchanged', () => {
    expect(containingDirectory('/lib/parts')).toBe(path.resolve('/lib/parts'))
  })
})

import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

import {
  findRipgrepPath,
  resolveRipgrepPath,
} from '../../../../agent/tools/grep/rgPath'

const EXPECTED_BINARY_NAME = process.platform === 'win32' ? 'rg.exe' : 'rg'

afterEach(() => {
  delete process.env.OPENCAD_RIPGREP_PATH
})

describe('resolveRipgrepPath', () => {
  test('resolves an existing binary from @vscode/ripgrep when uncompiled', async () => {
    const resolved = await resolveRipgrepPath()

    expect(path.basename(resolved)).toBe(EXPECTED_BINARY_NAME)
    expect(existsSync(resolved)).toBe(true)
  })

  test('caches the resolved path', async () => {
    expect(await resolveRipgrepPath()).toBe(await resolveRipgrepPath())
  })
})

describe('findRipgrepPath', () => {
  test('OPENCAD_RIPGREP_PATH takes precedence', async () => {
    process.env.OPENCAD_RIPGREP_PATH = '/custom/path/to/rg'

    expect(await findRipgrepPath()).toBe('/custom/path/to/rg')
  })

  // The compiled branch (dist/assets, staged by scripts/prebuild.ts) cannot be
  // reached from `bun test`, which always runs uncompiled.
  test('falls back to the package binary without the env override', async () => {
    expect(await findRipgrepPath()).toContain('ripgrep')
  })
})

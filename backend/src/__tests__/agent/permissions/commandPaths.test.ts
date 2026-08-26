import { afterAll, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { CONFIG_DIR } from 'shared'

import {
  deniedPathArgumentReason,
  outsideProjectArgument,
  pathArgumentsOf,
} from '../../../agent/permissions/builtin/commandPaths'

const words = (command: string): string[] => command.split(' ')

// Built at module scope rather than in `beforeAll`: `test.if` is evaluated
// while the file is being collected, which happens first.
const root = mkdtempSync(path.join(os.tmpdir(), 'opencad-cmdpaths-'))
const project = path.join(root, 'project')
const outside = path.join(root, 'elsewhere')
const outsideFile = path.join(outside, 'notes.md')

mkdirSync(project)
mkdirSync(outside)
mkdirSync(path.join(outside, '.git'))
writeFileSync(outsideFile, 'notes\n')
writeFileSync(path.join(project, 'notes.md'), 'notes\n')
writeFileSync(path.join(outside, '.git', 'config'), '[core]\n')

// A junction rather than a symlink on Windows, which grants symlinks to an
// unprivileged user only in developer mode. Both resolve the same way.
const linked = ((): boolean => {
  try {
    const type = os.platform() === 'win32' ? 'junction' : 'dir'
    symlinkSync(outside, path.join(project, 'link-out'), type)
    symlinkSync(path.join(outside, '.git'), path.join(project, 'vendor'), type)
    return true
  } catch {
    return false
  }
})()

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pathArgumentsOf', () => {
  test('leaves out the program, whose own lists decide whether it may run', () => {
    expect(pathArgumentsOf(words('cat notes.md'))).toEqual(['notes.md'])
    expect(pathArgumentsOf(words('pwd'))).toEqual([])
  })

  test('skips flags but keeps a value fused onto one', () => {
    expect(pathArgumentsOf(words('ls -la src'))).toEqual(['src'])
    expect(pathArgumentsOf(words('tar --file=../out.tar src'))).toEqual([
      '../out.tar',
      'src',
    ])
    expect(pathArgumentsOf(words('Get-Content -Path notes.md'))).toEqual([
      'notes.md',
    ])
  })

  test('skips a URL, which resolves onto a name while naming no file', () => {
    expect(pathArgumentsOf(words('curl https://example.com/keys.pem'))).toEqual(
      [],
    )
  })

  // The first bare word is the pattern, and any path comes after it.
  test('skips a search pattern, which is a regex and not a path', () => {
    expect(pathArgumentsOf(words('rg pattern src'))).toEqual(['src'])
    expect(pathArgumentsOf(words('rg -i pattern src'))).toEqual(['src'])
    expect(pathArgumentsOf(words('grep -e pattern notes.md'))).toEqual([
      'notes.md',
    ])
  })

  // `--files` takes no pattern, so the bare word after it is a path.
  test('keeps the argument when the search takes no pattern', () => {
    expect(pathArgumentsOf(words('rg --files src'))).toEqual(['src'])
    expect(pathArgumentsOf(words('rg --files-with-matches x src'))).toEqual([
      'src',
    ])
  })
})

describe('deniedPathArgumentReason', () => {
  const reason = (command: string): string | null =>
    deniedPathArgumentReason(words(command), project)

  test('catches a built-in denial named as an argument', () => {
    expect(reason('cat .env')).toContain('may hold secrets')
    expect(reason('cat .git/config')).toContain('off limits')
    expect(reason('Get-Content certs/server.pem')).toContain('certificate')
    expect(reason('cat keys/id_ed25519')).toContain('credential')
  })

  test('reads a leading tilde the way the shell would', () => {
    expect(reason('cat ~/.ssh/id_rsa')).toContain('off limits')
  })

  // The file does not have to be there: a command that writes would create it.
  test('catches a denial that does not exist yet', () => {
    expect(reason('cp deploy.pub ~/.ssh/authorized_keys')).toContain(
      'off limits',
    )
  })

  // Tokenized by hand: the config directory sits under the user's profile,
  // which may well have a space in it.
  test("catches the app's own data directory", () => {
    expect(
      deniedPathArgumentReason(
        ['cat', path.join(CONFIG_DIR, 'auth.json')],
        project,
      ),
    ).toContain('configuration and data directory')
  })

  test('leaves ordinary arguments alone', () => {
    expect(reason('cat notes.md')).toBeNull()
    expect(reason('git status')).toBeNull()
    expect(reason('cat .env.example')).toBeNull()
  })

  // On Windows the backslash in `\.env` reads as a separator, so without the
  // pattern being recognised this resolves onto a denied name.
  test('does not mistake a search pattern for a path', () => {
    expect(reason(String.raw`rg \.env src`)).toBeNull()
    expect(reason(String.raw`grep -r \.git src`)).toBeNull()
  })

  // Nothing about `vendor/config` is denied by name - only the path it
  // resolves to is, which is exactly what a link can hide.
  test.if(linked)('follows a link to a denial', () => {
    expect(reason('cat vendor/config')).toContain('off limits')
  })
})

describe('outsideProjectArgument', () => {
  const outsideArg = (command: string): string | null =>
    outsideProjectArgument(words(command), project)

  test('names an argument that reaches a real file outside the project', () => {
    expect(outsideArg(`cat ${outsideFile}`)).toBe(outsideFile)
    expect(outsideArg('cat ../elsewhere/notes.md')).toBe(
      '../elsewhere/notes.md',
    )
  })

  test('ignores anything inside the project', () => {
    expect(outsideArg('cat notes.md')).toBeNull()
    expect(outsideArg('ls -la .')).toBeNull()
  })

  // A word that resolves to nothing is a word, not a path, and reading it
  // would fail anyway - asking about it would settle nothing.
  test('ignores a word that names nothing', () => {
    expect(outsideArg('git diff HEAD~1')).toBeNull()
    expect(outsideArg('bun add left-pad')).toBeNull()
    expect(outsideArg('cat /nowhere/at/all.txt')).toBeNull()
  })

  test.if(linked)('follows a link out of the project', () => {
    expect(outsideArg('cat link-out/notes.md')).toBe('link-out/notes.md')
  })
})

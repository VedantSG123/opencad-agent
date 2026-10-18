import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os, { tmpdir } from 'node:os'
import path from 'node:path'

import type { PermissionAccess } from 'shared'

import { createPathGuard } from '../../../../agent/permissions/pathGuard'
import type { PathGuard } from '../../../../agent/permissions/pathGuard'
import { checkToolCall } from '../../../../agent/permissions/request/checkToolCall'
import { choiceForScope } from '../../../../agent/permissions/request/describeRequest'
import { buildRule } from '../../../../agent/permissions/rules/buildRule'
import { create } from '../../../../agent/tools/create'
import type { ToolContext } from '../../../../agent/tools/types'

const SESSION = 'ses_create_test'

// A junction on Windows, where a symlink needs developer mode or admin rights.
// Both resolve the same way.
const LINK_TYPE = os.platform() === 'win32' ? 'junction' : 'dir'

const CAN_LINK = await (async () => {
  const probe = await mkdtemp(path.join(tmpdir(), 'create-link-probe-'))
  try {
    await mkdir(path.join(probe, 'target'))
    await symlink(path.join(probe, 'target'), path.join(probe, 'link'), LINK_TYPE)
    return true
  } catch {
    return false
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
})()

let base = ''
let root = ''
let outside = ''

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'create-test-'))
  root = path.join(base, 'project')
  outside = path.join(base, 'elsewhere')
  await mkdir(root)
  await mkdir(outside)
  await mkdir(path.join(root, 'src'))
  await writeFile(path.join(root, 'src', 'parts.js'), 'export const x = 1\n')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

/** A guard for the temp project that also allows `granted`, if given. */
function guardAllowing(
  granted?: string,
  access: PermissionAccess = 'write',
): PathGuard {
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
    tool: 'create',
    projectDirectory: root,
    sessionId: SESSION,
    currentRules: () => rules,
  })
}

function contextWith(permissions?: PathGuard): ToolContext {
  return { workingDirectory: root, permissions }
}

async function runCreate(
  input: { path: string; content: string },
  permissions?: PathGuard,
): Promise<string> {
  return create(input, contextWith(permissions), undefined)
}

const contentsOf = (relative: string): Promise<string> =>
  readFile(path.join(root, relative), 'utf-8')

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

describe('create tool', () => {
  describe('writing a new file', () => {
    test('writes the content and reports what it made', async () => {
      const content = 'module bracket() {\n  cube([10, 10, 2]);\n}\n'
      const result = await runCreate({ path: 'src/bracket.scad', content })

      expect(result).toBe(
        `Created src/bracket.scad (3 lines, ${Buffer.byteLength(content)} bytes).`,
      )
      expect(await contentsOf('src/bracket.scad')).toBe(content)
    })

    // The model decides the bytes, so nothing is normalised on the way through.
    test('writes the content verbatim', async () => {
      await runCreate({ path: 'raw.txt', content: 'a\r\nb' })

      expect(await contentsOf('raw.txt')).toBe('a\r\nb')
    })

    test('accepts an empty file', async () => {
      const result = await runCreate({ path: 'notes.md', content: '' })

      expect(result).toBe('Created notes.md (empty).')
      expect(await contentsOf('notes.md')).toBe('')
    })

    test('counts a line that has no trailing newline', async () => {
      const result = await runCreate({ path: 'one.txt', content: 'only' })

      expect(result).toContain('1 line, 4 bytes')
    })

    test('makes the directories along the way and says so', async () => {
      const result = await runCreate({
        path: 'src/deep/nested/part.js',
        content: 'export const y = 2\n',
      })

      expect(result).toContain('Created src/deep/nested/part.js')
      expect(result).toContain('Created the directory src/deep/nested')
      expect(await contentsOf('src/deep/nested/part.js')).toBe(
        'export const y = 2\n',
      )
    })

    test('says nothing about directories when none were needed', async () => {
      const result = await runCreate({ path: 'src/plain.js', content: 'x\n' })

      expect(result).not.toContain('directory')
    })
  })

  describe('refusing to replace anything', () => {
    test('refuses a file that is already there, and points at edit', async () => {
      const result = await runCreate({
        path: 'src/parts.js',
        content: 'export const x = 2\n',
      })

      expect(result).toContain('already exists')
      expect(result).toContain('use edit')
      // The whole point of the refusal: the file is untouched.
      expect(await contentsOf('src/parts.js')).toBe('export const x = 1\n')
    })

    test('refuses a directory', async () => {
      expect(await runCreate({ path: 'src', content: 'x' })).toContain(
        'is an existing directory',
      )
    })

    test('refuses the project directory itself', async () => {
      expect(await runCreate({ path: '.', content: 'x' })).toContain(
        'is the project directory itself',
      )
    })

    test('refuses a path leading through a file', async () => {
      const result = await runCreate({
        path: 'src/parts.js/inner.js',
        content: 'x',
      })

      expect(result).toContain('src/parts.js is not a directory')
    })

    test('refuses a name with nothing in it', async () => {
      expect(await runCreate({ path: '   ', content: 'x' })).toContain(
        'must name a file to create',
      )
    })
  })

  describe('the policy decides where it may write', () => {
    test('refuses outside the project when nothing allows it', async () => {
      const target = path.join(outside, 'notes.md')
      const result = await runCreate(
        { path: target, content: 'x\n' },
        guardAllowing(),
      )

      expect(result).toContain('has not been approved for write access')
      expect(await exists(target)).toBe(false)
    })

    test('writes outside the project once a rule allows it', async () => {
      const target = path.join(outside, 'notes.md')
      const result = await runCreate(
        { path: target, content: 'x\n' },
        guardAllowing(outside),
      )

      expect(result).toContain(`Created ${target}`)
      expect(await readFile(target, 'utf-8')).toBe('x\n')
    })

    // Approved outside files are named in full, directories included - a
    // relative name would be counted from a root the file is not under.
    test('names an outside directory it had to make in full', async () => {
      const result = await runCreate(
        { path: path.join(outside, 'deep', 'notes.md'), content: 'x\n' },
        guardAllowing(outside),
      )

      expect(result).toContain(
        `Created the directory ${path.join(outside, 'deep')}`,
      )
      expect(result).not.toContain('..')
    })

    // Being allowed to read a directory is not licence to add files to it.
    test('a read grant is not enough to create there', async () => {
      const result = await runCreate(
        { path: path.join(outside, 'notes.md'), content: 'x\n' },
        guardAllowing(outside, 'read'),
      )

      expect(result).toContain('has not been approved for write access')
    })

    test('refuses a built-in denial, whatever the rules say', async () => {
      const granted = guardAllowing(root)

      expect(
        await runCreate({ path: '.env', content: 'K=1\n' }, granted),
      ).toContain('environment files may hold secrets')
      expect(
        await runCreate({ path: '.git/hooks/pre-push', content: 'x' }, granted),
      ).toContain('off limits')
      expect(
        await runCreate({ path: 'certs/server.pem', content: 'x' }, granted),
      ).toContain('key and certificate files')
    })
  })

  // The file does not exist yet, so the nearest existing directory is the only
  // thing that can be resolved - and a link there moves everything under it.
  describe('a link on the path cannot move the write', () => {
    test.if(CAN_LINK)('refuses when a directory leads outside', async () => {
      await symlink(outside, path.join(root, 'vendor'), LINK_TYPE)

      const result = await runCreate(
        { path: 'vendor/notes.md', content: 'x\n' },
        guardAllowing(),
      )

      expect(result).toContain('has not been approved for write access')
      expect(await exists(path.join(outside, 'notes.md'))).toBe(false)
    })

    test.if(CAN_LINK)('refuses when a link leads into a denial', async () => {
      const secrets = path.join(outside, '.ssh')
      await mkdir(secrets)
      await symlink(secrets, path.join(root, 'keys'), LINK_TYPE)

      const result = await runCreate(
        { path: 'keys/authorized_keys', content: 'ssh-rsa x\n' },
        guardAllowing(root),
      )

      expect(result).toContain('off limits')
      expect(await exists(path.join(secrets, 'authorized_keys'))).toBe(false)
    })
  })

  // The guard is only half of it: the descriptor decides what the user is
  // asked for, and a read grant would never let the write through.
  test('the policy asks for write access on a path outside the project', async () => {
    const target = path.join(outside, 'notes.md')
    const verdict = await checkToolCall(
      {
        toolName: 'create',
        toolCallId: 'call_1',
        input: { path: target, content: 'x\n' },
      },
      { sessionId: SESSION, projectDirectory: root, rules: [] },
    )

    expect(verdict.decision).toBe('ask')
    if (verdict.decision !== 'ask') return
    expect(verdict.request.access).toEqual({
      kind: 'path',
      path: target,
      access: 'write',
    })
    expect(choiceForScope(verdict.request, 'project')?.rule?.match).toEqual({
      kind: 'pathPrefix',
      path: outside,
      access: 'write',
    })
  })

  test('a cancelled call leaves nothing behind', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      create(
        { path: 'src/deep/part.js', content: 'x\n' },
        contextWith(),
        controller.signal,
      ),
    ).rejects.toThrow()

    expect(await exists(path.join(root, 'src', 'deep'))).toBe(false)
  })
})

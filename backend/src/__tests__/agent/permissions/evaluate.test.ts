import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { CONFIG_DIR } from 'shared'
import type { PermissionRule } from 'shared'

import type { EvaluationContext } from '../../../agent/permissions/evaluate'
import {
  evaluateAccess,
  evaluateAccesses,
} from '../../../agent/permissions/evaluate'
import type { ToolAccess } from '../../../agent/permissions/request/types'

const PROJECT = '/projects/demo'

const decisionFor = async (
  access: ToolAccess,
  context: EvaluationContext,
): Promise<string> => (await evaluateAccess(access, context)).decision

const decisionForAll = async (
  accesses: ToolAccess[],
  context: EvaluationContext,
): Promise<string> => (await evaluateAccesses(accesses, context)).decision

function contextWith(rules: PermissionRule[] = []): EvaluationContext {
  return { tool: 'read', projectDirectory: PROJECT, rules }
}

function rule(
  overrides: Partial<PermissionRule> & { match: PermissionRule['match'] },
): PermissionRule {
  return {
    id: 'perm_test',
    tool: '*',
    decision: 'allow',
    createdAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  }
}

describe('evaluateAccess', () => {
  describe('paths', () => {
    test('allows anything inside the project', async () => {
      expect(
        await decisionFor(
          { kind: 'path', path: 'lib/gears.scad', access: 'read' },
          contextWith(),
        ),
      ).toBe('allow')
    })

    test('asks about a path outside the project', async () => {
      expect(
        await decisionFor(
          { kind: 'path', path: '/elsewhere/gears.scad', access: 'read' },
          contextWith(),
        ),
      ).toBe('ask')
    })

    test('allows an outside path once a rule covers it', async () => {
      const rules = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      expect(
        await decisionFor(
          { kind: 'path', path: '/elsewhere/gears.scad', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('allow')
    })

    test('does not let a rule for one directory cover its sibling', async () => {
      const rules = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      expect(
        await decisionFor(
          { kind: 'path', path: '/other/gears.scad', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('ask')
    })

    test('only applies a rule scoped to another tool to that tool', async () => {
      const rules = [
        rule({
          tool: 'grep',
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      const access = {
        kind: 'path',
        path: '/elsewhere/gears.scad',
        access: 'read',
      } as const

      expect(await decisionFor(access, contextWith(rules))).toBe('ask')
      expect(
        await decisionFor(access, { ...contextWith(rules), tool: 'grep' }),
      ).toBe('allow')
    })

    test('deny beats allow', async () => {
      const rules = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
        rule({
          id: 'perm_deny',
          decision: 'deny',
          match: {
            kind: 'pathPrefix',
            path: '/elsewhere/secrets',
            access: 'read',
          },
        }),
      ]

      expect(
        await decisionFor(
          { kind: 'path', path: '/elsewhere/gears.scad', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('allow')
      expect(
        await decisionFor(
          { kind: 'path', path: '/elsewhere/secrets/key.txt', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('deny')
    })

    test('a write grant covers reading, but a read grant does not cover writing', async () => {
      const writable = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'write' },
        }),
      ]
      expect(
        await decisionFor(
          { kind: 'path', path: '/elsewhere/a.scad', access: 'read' },
          contextWith(writable),
        ),
      ).toBe('allow')

      const readable = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      expect(
        await decisionFor(
          { kind: 'path', path: '/elsewhere/a.scad', access: 'write' },
          contextWith(readable),
        ),
      ).toBe('ask')
    })

    test('denying reads denies writes too', async () => {
      const rules = [
        rule({
          decision: 'deny',
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      expect(
        await decisionFor(
          { kind: 'path', path: '/elsewhere/a.scad', access: 'write' },
          contextWith(rules),
        ),
      ).toBe('deny')
    })
  })

  describe('built-in denials', () => {
    test('refuses secrets and version control inside the project', async () => {
      for (const target of [
        '.env',
        '.env.local',
        '.git/config',
        'certs/server.pem',
        'keys/id_ed25519',
      ]) {
        expect(
          await decisionFor(
            { kind: 'path', path: target, access: 'read' },
            contextWith(),
          ),
        ).toBe('deny')
      }
    })

    test('refuses them whatever the case, since Windows and macOS would open the same file', async () => {
      for (const target of ['.ENV', '.Git/config', 'keys/ID_ED25519']) {
        expect(
          await decisionFor(
            { kind: 'path', path: target, access: 'read' },
            contextWith(),
          ),
        ).toBe('deny')
      }
    })

    test('lets sample env files through', async () => {
      for (const target of ['.env.example', '.env.sample', '.env.template']) {
        expect(
          await decisionFor(
            { kind: 'path', path: target, access: 'read' },
            contextWith(),
          ),
        ).toBe('allow')
      }
    })

    test("refuses the app's own config directory", async () => {
      expect(
        await decisionFor(
          {
            kind: 'path',
            path: path.join(CONFIG_DIR, 'auth.json'),
            access: 'read',
          },
          contextWith(),
        ),
      ).toBe('deny')
    })

    test('a grant cannot open up a built-in denial', async () => {
      const rules = [
        rule({ match: { kind: 'pathPrefix', path: PROJECT, access: 'write' } }),
      ]
      expect(
        await decisionFor(
          { kind: 'path', path: '.env', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('deny')
    })
  })

  describe('commands', () => {
    test('asks about an unrecognised command', async () => {
      expect(
        await decisionFor(
          { kind: 'command', command: 'bun add left-pad' },
          contextWith(),
        ),
      ).toBe('ask')
    })

    test('allows a command covered by a head rule', async () => {
      const rules = [
        rule({
          tool: 'shell',
          match: { kind: 'commandHead', tokens: ['bun', 'add'] },
        }),
      ]
      const context = { ...contextWith(rules), tool: 'shell' }

      expect(
        await decisionFor({ kind: 'command', command: 'bun add zod' }, context),
      ).toBe('allow')
      expect(
        await decisionFor({ kind: 'command', command: 'bun add' }, context),
      ).toBe('allow')
    })

    test('does not let a head rule match part of a longer token', async () => {
      const rules = [
        rule({
          tool: 'shell',
          match: { kind: 'commandHead', tokens: ['bun', 'add'] },
        }),
      ]
      expect(
        await decisionFor(
          { kind: 'command', command: 'bun adduser root' },
          { ...contextWith(rules), tool: 'shell' },
        ),
      ).toBe('ask')
    })

    test('allows only the command an exact rule names', async () => {
      const rules = [
        rule({
          tool: 'shell',
          match: { kind: 'commandExact', command: 'node -e "go()"' },
        }),
      ]
      const context = { ...contextWith(rules), tool: 'shell' }

      expect(
        await decisionFor(
          { kind: 'command', command: 'node -e "go()"' },
          context,
        ),
      ).toBe('allow')
      expect(
        await decisionFor(
          { kind: 'command', command: 'node -e "other()"' },
          context,
        ),
      ).toBe('ask')
    })
  })
})

describe('evaluateAccesses', () => {
  test('takes the strictest decision across every access', async () => {
    const inside = { kind: 'path', path: 'a.scad', access: 'read' } as const
    const outside = {
      kind: 'path',
      path: '/elsewhere/b.scad',
      access: 'read',
    } as const
    const denied = { kind: 'path', path: '.env', access: 'read' } as const

    expect(await decisionForAll([inside], contextWith())).toBe('allow')
    expect(await decisionForAll([inside, outside], contextWith())).toBe('ask')
    expect(await decisionForAll([inside, outside, denied], contextWith())).toBe(
      'deny',
    )
  })

  test('allows a call that touches nothing', async () => {
    expect(await decisionForAll([], contextWith())).toBe('allow')
  })
})

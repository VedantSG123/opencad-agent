import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { CONFIG_DIR } from 'shared'
import type { PermissionRule } from 'shared'

import type { EvaluationContext } from '../../../agent/permissions/evaluate'
import {
  evaluateAccess,
  evaluateAccesses,
} from '../../../agent/permissions/evaluate'

const PROJECT = '/projects/demo'

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
    test('allows anything inside the project', () => {
      expect(
        evaluateAccess(
          { kind: 'path', path: 'lib/gears.scad', access: 'read' },
          contextWith(),
        ),
      ).toBe('allow')
    })

    test('asks about a path outside the project', () => {
      expect(
        evaluateAccess(
          { kind: 'path', path: '/elsewhere/gears.scad', access: 'read' },
          contextWith(),
        ),
      ).toBe('ask')
    })

    test('allows an outside path once a rule covers it', () => {
      const rules = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      expect(
        evaluateAccess(
          { kind: 'path', path: '/elsewhere/gears.scad', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('allow')
    })

    test('does not let a rule for one directory cover its sibling', () => {
      const rules = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      expect(
        evaluateAccess(
          { kind: 'path', path: '/other/gears.scad', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('ask')
    })

    test('only applies a rule scoped to another tool to that tool', () => {
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

      expect(evaluateAccess(access, contextWith(rules))).toBe('ask')
      expect(
        evaluateAccess(access, { ...contextWith(rules), tool: 'grep' }),
      ).toBe('allow')
    })

    test('deny beats allow', () => {
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
        evaluateAccess(
          { kind: 'path', path: '/elsewhere/gears.scad', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('allow')
      expect(
        evaluateAccess(
          { kind: 'path', path: '/elsewhere/secrets/key.txt', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('deny')
    })

    test('a write grant covers reading, but a read grant does not cover writing', () => {
      const writable = [
        rule({
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'write' },
        }),
      ]
      expect(
        evaluateAccess(
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
        evaluateAccess(
          { kind: 'path', path: '/elsewhere/a.scad', access: 'write' },
          contextWith(readable),
        ),
      ).toBe('ask')
    })

    test('denying reads denies writes too', () => {
      const rules = [
        rule({
          decision: 'deny',
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        }),
      ]
      expect(
        evaluateAccess(
          { kind: 'path', path: '/elsewhere/a.scad', access: 'write' },
          contextWith(rules),
        ),
      ).toBe('deny')
    })
  })

  describe('built-in denials', () => {
    test('refuses secrets and version control inside the project', () => {
      for (const target of [
        '.env',
        '.env.local',
        '.git/config',
        'certs/server.pem',
        'keys/id_ed25519',
      ]) {
        expect(
          evaluateAccess(
            { kind: 'path', path: target, access: 'read' },
            contextWith(),
          ),
        ).toBe('deny')
      }
    })

    test("refuses the app's own config directory", () => {
      expect(
        evaluateAccess(
          {
            kind: 'path',
            path: path.join(CONFIG_DIR, 'auth.json'),
            access: 'read',
          },
          contextWith(),
        ),
      ).toBe('deny')
    })

    test('a grant cannot open up a built-in denial', () => {
      const rules = [
        rule({ match: { kind: 'pathPrefix', path: PROJECT, access: 'write' } }),
      ]
      expect(
        evaluateAccess(
          { kind: 'path', path: '.env', access: 'read' },
          contextWith(rules),
        ),
      ).toBe('deny')
    })
  })

  describe('commands', () => {
    test('asks about an unrecognised command', () => {
      expect(
        evaluateAccess(
          { kind: 'command', command: 'bun add left-pad' },
          contextWith(),
        ),
      ).toBe('ask')
    })

    test('allows a command covered by a prefix rule', () => {
      const rules = [
        rule({
          tool: 'shell',
          match: { kind: 'commandPrefix', prefix: 'bun add' },
        }),
      ]
      const context = { ...contextWith(rules), tool: 'shell' }

      expect(
        evaluateAccess({ kind: 'command', command: 'bun add zod' }, context),
      ).toBe('allow')
      expect(
        evaluateAccess({ kind: 'command', command: 'bun add' }, context),
      ).toBe('allow')
    })

    test('does not let a prefix match part of a longer word', () => {
      const rules = [
        rule({
          tool: 'shell',
          match: { kind: 'commandPrefix', prefix: 'bun add' },
        }),
      ]
      expect(
        evaluateAccess(
          { kind: 'command', command: 'bun adduser root' },
          { ...contextWith(rules), tool: 'shell' },
        ),
      ).toBe('ask')
    })
  })
})

describe('evaluateAccesses', () => {
  test('takes the strictest decision across every access', () => {
    const inside = { kind: 'path', path: 'a.scad', access: 'read' } as const
    const outside = {
      kind: 'path',
      path: '/elsewhere/b.scad',
      access: 'read',
    } as const
    const denied = { kind: 'path', path: '.env', access: 'read' } as const

    expect(evaluateAccesses([inside], contextWith())).toBe('allow')
    expect(evaluateAccesses([inside, outside], contextWith())).toBe('ask')
    expect(evaluateAccesses([inside, outside, denied], contextWith())).toBe(
      'deny',
    )
  })

  test('allows a call that touches nothing', () => {
    expect(evaluateAccesses([], contextWith())).toBe('allow')
  })
})

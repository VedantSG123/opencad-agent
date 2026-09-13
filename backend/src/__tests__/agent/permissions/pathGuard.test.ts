import { afterEach, describe, expect, test } from 'bun:test'
import path from 'node:path'

import { CONFIG_DIR } from 'shared'
import type { PermissionRule } from 'shared'

import { createPathGuard } from '../../../agent/permissions/pathGuard'
import type { PathGuard } from '../../../agent/permissions/pathGuard'
import {
  clearOnceGrants,
  grantOnce,
} from '../../../agent/permissions/rules/onceGrants'

const PROJECT = '/projects/demo'
const SESSION = 'ses_test'

function guardFor(tool: string, rules: PermissionRule[] = []): PathGuard {
  return createPathGuard({
    tool,
    projectDirectory: PROJECT,
    sessionId: SESSION,
    currentRules: () => rules,
  })
}

function allowRule(
  overrides: Partial<PermissionRule> & { match: PermissionRule['match'] },
): PermissionRule {
  return {
    id: 'perm_1',
    tool: '*',
    decision: 'allow',
    createdAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  clearOnceGrants(SESSION)
})

describe('createPathGuard', () => {
  test('permits anything inside the project', () => {
    expect(
      guardFor('read').refusalFor(`${PROJECT}/lib/gears.scad`, 'read'),
    ).toBeNull()
  })

  test('refuses a path outside the project, naming the access', () => {
    const refusal = guardFor('read').refusalFor('/elsewhere/gears.scad', 'read')

    expect(refusal).toContain('/elsewhere/gears.scad')
    expect(refusal).toContain('has not been approved for read access')
  })

  test('permits an outside path once a rule covers it', () => {
    const rules = [
      allowRule({
        match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
      }),
    ]
    expect(
      guardFor('read', rules).refusalFor('/elsewhere/gears.scad', 'read'),
    ).toBeNull()
  })

  // The dimension a flat list of allowed roots used to throw away.
  test('a read-only grant does not permit writing', () => {
    const rules = [
      allowRule({
        match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
      }),
    ]
    const guard = guardFor('edit', rules)

    expect(guard.refusalFor('/elsewhere/gears.scad', 'read')).toBeNull()
    expect(guard.refusalFor('/elsewhere/gears.scad', 'write')).toContain(
      'has not been approved for write access',
    )
  })

  test('a write grant also permits reading', () => {
    const rules = [
      allowRule({
        match: { kind: 'pathPrefix', path: '/elsewhere', access: 'write' },
      }),
    ]
    expect(
      guardFor('edit', rules).refusalFor('/elsewhere/gears.scad', 'read'),
    ).toBeNull()
  })

  // The other dimension a flat list threw away.
  test('a rule scoped to one tool does not widen another', () => {
    const rules = [
      allowRule({
        tool: 'grep',
        match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
      }),
    ]

    expect(
      guardFor('grep', rules).refusalFor('/elsewhere/gears.scad', 'read'),
    ).toBeNull()
    expect(
      guardFor('read', rules).refusalFor('/elsewhere/gears.scad', 'read'),
    ).toContain('has not been approved')
  })

  test('refuses a built-in denial even inside the project', () => {
    expect(guardFor('read').refusalFor(`${PROJECT}/.env`, 'read')).toContain(
      'cannot be accessed',
    )
    expect(
      guardFor('read').refusalFor(path.join(CONFIG_DIR, 'auth.json'), 'read'),
    ).toContain('cannot be accessed')
  })

  test('reads rules afresh on every check', () => {
    let rules: PermissionRule[] = []
    const guard = createPathGuard({
      tool: 'read',
      projectDirectory: PROJECT,
      sessionId: SESSION,
      currentRules: () => rules,
    })

    expect(guard.refusalFor('/elsewhere/gears.scad', 'read')).not.toBeNull()

    rules = [
      allowRule({
        match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
      }),
    ]
    expect(guard.refusalFor('/elsewhere/gears.scad', 'read')).toBeNull()
  })

  describe('once warrants', () => {
    test('admit the call they were issued for', () => {
      grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])
      const guard = guardFor('read')

      expect(
        guard.refusalFor('/elsewhere/gears.scad', 'read', 'call_1'),
      ).toBeNull()
    })

    test('admit nothing without the call id, and no other call', () => {
      grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])
      const guard = guardFor('read')

      expect(guard.refusalFor('/elsewhere/gears.scad', 'read')).not.toBeNull()
      expect(
        guard.refusalFor('/elsewhere/gears.scad', 'read', 'call_2'),
      ).not.toBeNull()
    })

    test('do not stretch to a neighbouring file', () => {
      grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])

      expect(
        guardFor('read').refusalFor(
          '/elsewhere/secrets.scad',
          'read',
          'call_1',
        ),
      ).not.toBeNull()
    })

    test('cannot open up a built-in denial', () => {
      grantOnce(SESSION, 'call_1', [`${PROJECT}/.env`])

      expect(
        guardFor('read').refusalFor(`${PROJECT}/.env`, 'read', 'call_1'),
      ).toContain('cannot be accessed')
    })
  })
})

import { afterEach, describe, expect, test } from 'bun:test'

import type { PermissionRule } from 'shared'

import { buildRule } from '../../../agent/permissions/rules/buildRule'
import {
  clearOnceGrants,
  grantOnce,
  hasOnceGrant,
  onceGrantedPaths,
} from '../../../agent/permissions/rules/onceGrants'
import { addRule } from '../../../agent/permissions/rules/ruleSet'
import {
  addSessionRule,
  clearSessionRules,
  getSessionRules,
} from '../../../agent/permissions/rules/sessionRules'

const SESSION = 'ses_test'
const CREATED_AT = '2026-08-09T00:00:00.000Z'

function ruleFor(path: string, id = 'perm_1'): PermissionRule {
  return buildRule(
    { tool: '*', match: { kind: 'pathPrefix', path, access: 'read' } },
    id,
    CREATED_AT,
  )
}

afterEach(() => {
  clearSessionRules(SESSION)
  clearOnceGrants(SESSION)
})

describe('buildRule', () => {
  test('resolves the granted path to an absolute one', () => {
    const rule = buildRule(
      {
        tool: 'read',
        match: {
          kind: 'pathPrefix',
          path: '/elsewhere/../elsewhere/lib',
          access: 'read',
        },
      },
      'perm_1',
      CREATED_AT,
    )

    expect(rule.match).toEqual({
      kind: 'pathPrefix',
      path: '/elsewhere/lib',
      access: 'read',
    })
    expect(rule.decision).toBe('allow')
  })

  test('leaves a command prefix untouched', () => {
    const rule = buildRule(
      { tool: 'shell', match: { kind: 'commandPrefix', prefix: 'bun add' } },
      'perm_1',
      CREATED_AT,
    )
    expect(rule.match).toEqual({ kind: 'commandPrefix', prefix: 'bun add' })
  })
})

describe('addRule', () => {
  test('ignores a duplicate of a rule already stored', () => {
    const rule = ruleFor('/elsewhere')
    const once = addRule([], rule)
    const twice = addRule(once, { ...rule, id: 'perm_2' })

    expect(once).toHaveLength(1)
    expect(twice).toHaveLength(1)
  })

  test('keeps a rule that differs in access', () => {
    const read = ruleFor('/elsewhere')
    const write = buildRule(
      {
        tool: '*',
        match: { kind: 'pathPrefix', path: '/elsewhere', access: 'write' },
      },
      'perm_2',
      CREATED_AT,
    )

    expect(addRule([read], write)).toHaveLength(2)
  })
})

describe('session rules', () => {
  test('are visible only to the session that recorded them', () => {
    addSessionRule(SESSION, ruleFor('/elsewhere'))

    expect(getSessionRules(SESSION)).toHaveLength(1)
    expect(getSessionRules('ses_other')).toHaveLength(0)
  })

  test('do not accumulate duplicates', () => {
    addSessionRule(SESSION, ruleFor('/elsewhere'))
    addSessionRule(SESSION, ruleFor('/elsewhere', 'perm_2'))

    expect(getSessionRules(SESSION)).toHaveLength(1)
  })

  test('are dropped when the session is cleared', () => {
    addSessionRule(SESSION, ruleFor('/elsewhere'))
    clearSessionRules(SESSION)

    expect(getSessionRules(SESSION)).toHaveLength(0)
  })
})

describe('once warrants', () => {
  test('record what was approved for the call', () => {
    grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])

    expect(hasOnceGrant(SESSION, 'call_1')).toBe(true)
    expect(onceGrantedPaths(SESSION, 'call_1')).toEqual([
      '/elsewhere/gears.scad',
    ])
  })

  // The approval check and the tool both read the warrant, so spending it on
  // first read would leave the tool unable to open what was just approved.
  test('survive being read, so both layers see the same answer', () => {
    grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])

    expect(hasOnceGrant(SESSION, 'call_1')).toBe(true)
    expect(hasOnceGrant(SESSION, 'call_1')).toBe(true)
    expect(onceGrantedPaths(SESSION, 'call_1')).toHaveLength(1)
  })

  test('cover only the call they name, in the session that holds them', () => {
    grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])

    expect(hasOnceGrant(SESSION, 'call_2')).toBe(false)
    expect(hasOnceGrant('ses_other', 'call_1')).toBe(false)
    expect(onceGrantedPaths(SESSION, 'call_2')).toEqual([])
  })

  test('are dropped when the session is cleared', () => {
    grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])
    clearOnceGrants(SESSION)

    expect(hasOnceGrant(SESSION, 'call_1')).toBe(false)
  })
})

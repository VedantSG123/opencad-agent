import { afterEach, describe, expect, test } from 'bun:test'

import type { PermissionRule } from 'shared'

import { buildRule } from '../../../agent/permissions/rules/buildRule'
import {
  commandExactRuleCovers,
  commandHeadRuleCovers,
} from '../../../agent/permissions/rules/match'
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

  test('leaves a command head untouched', () => {
    const rule = buildRule(
      { tool: 'shell', match: { kind: 'commandHead', tokens: ['bun', 'add'] } },
      'perm_1',
      CREATED_AT,
    )
    expect(rule.match).toEqual({ kind: 'commandHead', tokens: ['bun', 'add'] })
  })
})

describe('commandHeadRuleCovers', () => {
  const headRule = (tokens: string[]): PermissionRule =>
    buildRule(
      { tool: 'shell', match: { kind: 'commandHead', tokens } },
      'perm_1',
      CREATED_AT,
    )

  test('covers the head itself and anything extending it', () => {
    const rule = headRule(['bun', 'add'])

    expect(commandHeadRuleCovers(rule, ['bun', 'add'])).toBe(true)
    expect(commandHeadRuleCovers(rule, ['bun', 'add', 'zod'])).toBe(true)
  })

  test('does not cover a token that merely starts with a granted one', () => {
    expect(
      commandHeadRuleCovers(headRule(['bun', 'add']), ['bun', 'adduser']),
    ).toBe(false)
    expect(commandHeadRuleCovers(headRule(['bun']), ['bunx', 'oxlint'])).toBe(
      false,
    )
  })

  test('does not cover a shorter command than the head', () => {
    expect(commandHeadRuleCovers(headRule(['bun', 'add']), ['bun'])).toBe(false)
  })

  test('does not cover a different subcommand', () => {
    expect(
      commandHeadRuleCovers(headRule(['bun', 'add']), ['bun', 'remove', 'zod']),
    ).toBe(false)
  })

  test('ignores rules of another kind', () => {
    expect(commandHeadRuleCovers(ruleFor('/elsewhere'), ['bun', 'add'])).toBe(
      false,
    )
  })
})

describe('commandExactRuleCovers', () => {
  const exactRule = (command: string): PermissionRule =>
    buildRule(
      { tool: 'shell', match: { kind: 'commandExact', command } },
      'perm_1',
      CREATED_AT,
    )

  test('covers only the command it names', () => {
    const rule = exactRule('node -e "console.log(1)"')

    expect(commandExactRuleCovers(rule, 'node -e "console.log(1)"')).toBe(true)
    expect(commandExactRuleCovers(rule, 'node -e "console.log(2)"')).toBe(false)
  })

  test('tolerates surrounding whitespace only', () => {
    const rule = exactRule('bun run build')

    expect(commandExactRuleCovers(rule, '  bun run build  ')).toBe(true)
    expect(commandExactRuleCovers(rule, 'bun  run build')).toBe(false)
  })

  test('ignores rules of another kind', () => {
    expect(commandExactRuleCovers(headRuleForOtherKind(), 'bun add zod')).toBe(
      false,
    )
  })
})

function headRuleForOtherKind(): PermissionRule {
  return buildRule(
    { tool: 'shell', match: { kind: 'commandHead', tokens: ['bun', 'add'] } },
    'perm_1',
    CREATED_AT,
  )
}

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

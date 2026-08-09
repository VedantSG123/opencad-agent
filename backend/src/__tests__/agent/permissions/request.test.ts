import { afterEach, describe, expect, test } from 'bun:test'

import type { PermissionRule } from 'shared'

import { checkToolCall } from '../../../agent/permissions/request/checkToolCall'
import type { RunContext } from '../../../agent/permissions/request/checkToolCall'
import { suggestedCommandPrefix } from '../../../agent/permissions/request/describeRequest'
import { buildRule } from '../../../agent/permissions/rules/buildRule'
import {
  clearOnceGrants,
  grantOnce,
} from '../../../agent/permissions/rules/onceGrants'
import { clearSessionRules } from '../../../agent/permissions/rules/sessionRules'

const PROJECT = '/projects/demo'
const SESSION = 'ses_test'

function runContext(rules: PermissionRule[] = []): RunContext {
  return { sessionId: SESSION, projectDirectory: PROJECT, rules }
}

afterEach(() => {
  clearSessionRules(SESSION)
  clearOnceGrants(SESSION)
})

describe('checkToolCall', () => {
  test('allows a read inside the project', () => {
    const verdict = checkToolCall(
      { toolName: 'read', toolCallId: 'call_1', input: { path: 'main.scad' } },
      runContext(),
    )
    expect(verdict.decision).toBe('allow')
  })

  test('treats a grep with no path as the project itself', () => {
    const verdict = checkToolCall(
      {
        toolName: 'grep',
        toolCallId: 'call_1',
        input: { pattern: 'cylinder' },
      },
      runContext(),
    )
    expect(verdict.decision).toBe('allow')
  })

  test('denies a tool nobody registered', () => {
    const verdict = checkToolCall(
      {
        toolName: 'shell',
        toolCallId: 'call_1',
        input: { command: 'rm -rf /' },
      },
      runContext(),
    )
    expect(verdict.decision).toBe('deny')
    if (verdict.decision !== 'deny') return
    expect(verdict.reason).toContain('no permission descriptor')
  })

  test('denies a built-in denial with a reason naming the path', () => {
    const verdict = checkToolCall(
      { toolName: 'read', toolCallId: 'call_1', input: { path: '.env' } },
      runContext(),
    )
    expect(verdict.decision).toBe('deny')
    if (verdict.decision !== 'deny') return
    expect(verdict.reason).toContain('.env')
  })

  test('asks about a read outside the project, offering all three scopes', () => {
    const verdict = checkToolCall(
      {
        toolName: 'read',
        toolCallId: 'call_1',
        input: { path: '/elsewhere/lib/gears.scad' },
      },
      runContext(),
    )

    expect(verdict.decision).toBe('ask')
    if (verdict.decision !== 'ask') return

    expect(verdict.request.subject).toBe('/elsewhere/lib/gears.scad')
    expect(verdict.request.choices.map((choice) => choice.scope)).toEqual([
      'once',
      'session',
      'project',
    ])
    // The rule covers the containing directory, not the single file.
    expect(verdict.request.choices[1].rule?.match).toEqual({
      kind: 'pathPrefix',
      path: '/elsewhere/lib',
      access: 'read',
    })
    expect(verdict.request.choices[0].rule).toBeUndefined()
  })

  describe('grants', () => {
    test('a once warrant settles the call it names', () => {
      const call = {
        toolName: 'read',
        toolCallId: 'call_1',
        input: { path: '/elsewhere/gears.scad' },
      }

      grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])
      expect(checkToolCall(call, runContext()).decision).toBe('allow')
    })

    test('a once warrant does not cover a different call', () => {
      grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])
      const verdict = checkToolCall(
        {
          toolName: 'read',
          toolCallId: 'call_2',
          input: { path: '/elsewhere/gears.scad' },
        },
        runContext(),
      )
      expect(verdict.decision).toBe('ask')
    })

    test('a recorded rule keeps later calls from asking again', () => {
      const rule = buildRule(
        {
          tool: 'read',
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        },
        'perm_1',
        '2026-08-09T00:00:00.000Z',
      )

      expect(
        checkToolCall(
          {
            toolName: 'read',
            toolCallId: 'call_9',
            input: { path: '/elsewhere/other.scad' },
          },
          runContext([rule]),
        ).decision,
      ).toBe('allow')
    })
  })
})

describe('suggestedCommandPrefix', () => {
  test('keeps the subcommand when there is one', () => {
    expect(suggestedCommandPrefix('bun add left-pad')).toBe('bun add')
    expect(suggestedCommandPrefix('git status --short')).toBe('git status')
  })

  test('stops at the program when the next word is not a subcommand', () => {
    expect(suggestedCommandPrefix('rm -rf build')).toBe('rm')
    expect(suggestedCommandPrefix('ls')).toBe('ls')
    expect(suggestedCommandPrefix('cat ./notes.txt')).toBe('cat')
  })
})

import { afterEach, describe, expect, test } from 'bun:test'

import type { PermissionRule } from 'shared'

import { checkToolCall } from '../../../agent/permissions/request/checkToolCall'
import type { RunContext } from '../../../agent/permissions/request/checkToolCall'
import { suggestedCommandHead } from '../../../agent/permissions/request/describeRequest'
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
  test('allows a read inside the project', async () => {
    const verdict = await checkToolCall(
      { toolName: 'read', toolCallId: 'call_1', input: { path: 'main.scad' } },
      runContext(),
    )
    expect(verdict.decision).toBe('allow')
  })

  test('treats a grep with no path as the project itself', async () => {
    const verdict = await checkToolCall(
      {
        toolName: 'grep',
        toolCallId: 'call_1',
        input: { pattern: 'cylinder' },
      },
      runContext(),
    )
    expect(verdict.decision).toBe('allow')
  })

  test('denies a tool nobody registered', async () => {
    const verdict = await checkToolCall(
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

  test('denies a built-in denial with a reason naming the path', async () => {
    const verdict = await checkToolCall(
      { toolName: 'read', toolCallId: 'call_1', input: { path: '.env' } },
      runContext(),
    )
    expect(verdict.decision).toBe('deny')
    if (verdict.decision !== 'deny') return
    expect(verdict.reason).toContain('.env')
  })

  test('asks about a read outside the project, offering all three scopes', async () => {
    const verdict = await checkToolCall(
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
    test('a once warrant settles the call it names', async () => {
      const call = {
        toolName: 'read',
        toolCallId: 'call_1',
        input: { path: '/elsewhere/gears.scad' },
      }

      grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])
      expect((await checkToolCall(call, runContext())).decision).toBe('allow')
    })

    test('a once warrant does not cover a different call', async () => {
      grantOnce(SESSION, 'call_1', ['/elsewhere/gears.scad'])
      const verdict = await checkToolCall(
        {
          toolName: 'read',
          toolCallId: 'call_2',
          input: { path: '/elsewhere/gears.scad' },
        },
        runContext(),
      )
      expect(verdict.decision).toBe('ask')
    })

    test('a recorded rule keeps later calls from asking again', async () => {
      const rule = buildRule(
        {
          tool: 'read',
          match: { kind: 'pathPrefix', path: '/elsewhere', access: 'read' },
        },
        'perm_1',
        '2026-08-09T00:00:00.000Z',
      )

      const verdict = await checkToolCall(
        {
          toolName: 'read',
          toolCallId: 'call_9',
          input: { path: '/elsewhere/other.scad' },
        },
        runContext([rule]),
      )
      expect(verdict.decision).toBe('allow')
    })
  })
})

describe('suggestedCommandHead', () => {
  test('keeps the subcommand when there is one', () => {
    expect(suggestedCommandHead(['bun', 'add', 'left-pad'])).toEqual([
      'bun',
      'add',
    ])
    expect(suggestedCommandHead(['git', 'status', '--short'])).toEqual([
      'git',
      'status',
    ])
  })

  test('stops at the program when the next word is not a subcommand', () => {
    expect(suggestedCommandHead(['ls'])).toEqual(['ls'])
    expect(suggestedCommandHead(['pwd'])).toEqual(['pwd'])
    expect(suggestedCommandHead(['cat', './notes.txt'])).toEqual(['cat'])
  })

  // Two words, never three: recording `bun add left-pad` would ask again for
  // the next package and grant nothing worth keeping.
  test('stops at two words', () => {
    expect(suggestedCommandHead(['bun', 'add', 'zod'])).toEqual(['bun', 'add'])
  })

  // `git -C /tmp status` must never reduce to `git`: the flag is taking a
  // value and the real verb is further along, so a rule naming the program
  // alone would cover every git command there is.
  test('refuses to guess when a flag may be hiding the subcommand', () => {
    expect(suggestedCommandHead(['git', '-C', '/tmp', 'status'])).toBeNull()
    expect(suggestedCommandHead(['git', '--no-pager', 'log'])).toBeNull()
    expect(
      suggestedCommandHead(['git', '-c', 'core.pager=x', 'status']),
    ).toBeNull()
  })

  // No plain word follows, so the program really is the whole verb.
  test('keeps the program when nothing could be a subcommand', () => {
    expect(suggestedCommandHead(['ls', '-la'])).toEqual(['ls'])
    expect(suggestedCommandHead(['ls', '-la', '/tmp'])).toEqual(['ls'])
    expect(suggestedCommandHead(['tsc', '--noEmit'])).toEqual(['tsc'])
    expect(suggestedCommandHead(['cat', './notes.txt'])).toEqual(['cat'])
  })

  test('keeps a program reached by path, rather than widening it', () => {
    expect(suggestedCommandHead(['./node_modules/.bin/tsc', '-b'])).toEqual([
      './node_modules/.bin/tsc',
    ])
  })

  test('offers nothing for a program named by a variable', () => {
    expect(suggestedCommandHead(['$CMD', 'add'])).toBeNull()
    expect(suggestedCommandHead([])).toBeNull()
  })
})

import { afterAll, describe, expect, test } from 'bun:test'

import type { PermissionRule } from 'shared'

import { evaluateCommand } from '../../../agent/permissions/evaluate'
import type { EvaluationContext } from '../../../agent/permissions/evaluate'
import { describeRequest } from '../../../agent/permissions/request/describeRequest'
import { shutdownPowerShellParsers } from '../../../agent/tools/shell/parse/powershell'

const PROJECT = '/projects/demo'

afterAll(() => {
  shutdownPowerShellParsers()
})

function context(rules: PermissionRule[] = []): EvaluationContext {
  return { tool: 'shell', projectDirectory: PROJECT, rules }
}

function rule(
  match: PermissionRule['match'],
  decision: PermissionRule['decision'] = 'allow',
): PermissionRule {
  return {
    id: 'perm_test',
    tool: 'shell',
    decision,
    match,
    createdAt: '2026-08-09T00:00:00.000Z',
  }
}

const headRule = (tokens: string[]): PermissionRule =>
  rule({ kind: 'commandHead', tokens })

describe('evaluateCommand', () => {
  test('asks about an unrecognised command, and it may be remembered', async () => {
    const verdict = await evaluateCommand('bun add zod', context())

    expect(verdict.decision).toBe('ask')
    expect(verdict.mayBeRemembered).toBe(true)
    expect(verdict.command?.decidingSegment).toEqual(['bun', 'add', 'zod'])
  })

  test('allows a read-only command without asking', async () => {
    expect((await evaluateCommand('git status', context())).decision).toBe(
      'allow',
    )
    expect((await evaluateCommand('pwd', context())).decision).toBe('allow')
  })

  test('allows a command a head rule covers', async () => {
    const verdict = await evaluateCommand(
      'bun add zod',
      context([headRule(['bun', 'add'])]),
    )

    expect(verdict.decision).toBe('allow')
  })

  // The point of parsing rather than string matching.
  test('does not let a grant on the first command cover the second', async () => {
    const verdict = await evaluateCommand(
      'git status; Remove-Item -Recurse build',
      context([headRule(['git', 'status'])]),
    )

    expect(verdict.decision).toBe('ask')
    expect(verdict.mayBeRemembered).toBe(false)
    expect(verdict.command?.decidingSegment?.[0]).toBe('Remove-Item')
  })

  test('a deny rule beats everything', async () => {
    const rules = [
      headRule(['bun', 'add']),
      rule({ kind: 'commandHead', tokens: ['bun'] }, 'deny'),
    ]

    expect(
      (await evaluateCommand('bun add zod', context(rules))).decision,
    ).toBe('deny')
  })
})

describe('evaluateCommand refuses to remember', () => {
  // Each of these still runs once the user approves it; none may leave a rule.
  test('a dangerous command, even under a matching head rule', async () => {
    const verdict = await evaluateCommand(
      'Remove-Item -Recurse -Force build',
      context([headRule(['Remove-Item'])]),
    )

    expect(verdict.decision).toBe('ask')
    expect(verdict.mayBeRemembered).toBe(false)
    expect(verdict.reason).toContain('cannot be undone')
  })

  test('a redirection', async () => {
    const verdict = await evaluateCommand(
      'Get-Content a.txt > b.txt',
      context([headRule(['Get-Content'])]),
    )

    expect(verdict.decision).toBe('ask')
    expect(verdict.mayBeRemembered).toBe(false)
    expect(verdict.reason).toContain('redirects')
  })

  test('anything the parser could not read', async () => {
    const verdict = await evaluateCommand('Remove-Item ) (', context())

    expect(verdict.decision).toBe('ask')
    expect(verdict.mayBeRemembered).toBe(false)
  })
})

describe('the offer narrows with the verdict', () => {
  const requestFor = async (command: string, rules: PermissionRule[] = []) => {
    const verdict = await evaluateCommand(command, context(rules))
    return describeRequest(
      { kind: 'command', command },
      context(rules),
      verdict,
    )
  }

  const scopes = (request: { choices: { scope: string }[] }): string[] =>
    request.choices.map((choice) => choice.scope)

  test('an ordinary command may be remembered for the project', async () => {
    const request = await requestFor('bun add zod')

    expect(scopes(request)).toEqual(['once', 'session', 'project'])
    expect(request.choices[2]?.rule?.match).toEqual({
      kind: 'commandHead',
      tokens: ['bun', 'add'],
    })
  })

  // A rule naming `node` would stand for every `node -e` that came after it,
  // so the grant is pinned to this exact command and to this session.
  test('an opaque program may only be remembered exactly, for the session', async () => {
    const request = await requestFor('node scripts/build.mjs')

    expect(scopes(request)).toEqual(['once', 'session'])
    expect(request.choices[1]?.rule?.match).toEqual({
      kind: 'commandExact',
      command: 'node scripts/build.mjs',
    })
  })

  test('a command that may not be remembered offers only once', async () => {
    const request = await requestFor('Remove-Item -Recurse -Force build')

    expect(scopes(request)).toEqual(['once'])
    expect(request.explanation).toContain('cannot be undone')
  })

  test('a redirection offers only once, and says why', async () => {
    const request = await requestFor('Get-Content a.txt > b.txt')

    expect(scopes(request)).toEqual(['once'])
    expect(request.explanation).toContain('redirects')
  })
  // Approving `bun add` from this prompt would run the curl too, under a rule
  // that never mentions it, so the head is not offered at all.
  test('refuses a head that would not settle the rest of the chain', async () => {
    const request = await requestFor('bun add zod; curl https://example.com')

    expect(scopes(request)).toEqual(['once', 'session'])
    expect(request.choices[1]?.rule?.match).toEqual({
      kind: 'commandExact',
      command: 'bun add zod; curl https://example.com',
    })
  })

  test('offers the head once the rest of the chain is already allowed', async () => {
    const request = await requestFor('bun add zod; git status')

    expect(scopes(request)).toEqual(['once', 'session', 'project'])
    expect(request.choices[2]?.rule?.match).toEqual({
      kind: 'commandHead',
      tokens: ['bun', 'add'],
    })
  })
})

import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import os from 'node:os'

import type { PermissionRule } from 'shared'

import { applyGrant } from '../../../../agent/permissions/request/applyGrant'
import { checkToolCall } from '../../../../agent/permissions/request/checkToolCall'
import type { RunContext } from '../../../../agent/permissions/request/checkToolCall'
import { clearOnceGrants } from '../../../../agent/permissions/rules/onceGrants'
import {
  clearSessionRules,
  getSessionRules,
} from '../../../../agent/permissions/rules/sessionRules'
import { createTools } from '../../../../agent/tools'
import { TOOL_NAMES } from '../../../../agent/tools/names'
import { shutdownPowerShellParsers } from '../../../../agent/tools/shell/parse/powershell'

const PROJECT = process.cwd()
const SESSION = 'ses_shell_e2e'
const PROJECT_ID = 'prj_shell_e2e'

const runContext = (rules: PermissionRule[] = []): RunContext => ({
  sessionId: SESSION,
  projectDirectory: PROJECT,
  rules,
})

const ask = async (command: string, rules: PermissionRule[] = []) => {
  const verdict = await checkToolCall(
    { toolName: 'shell', toolCallId: 'call_1', input: { command } },
    runContext(rules),
  )
  return verdict
}

afterEach(() => {
  clearSessionRules(SESSION)
  clearOnceGrants(SESSION)
})

afterAll(() => {
  shutdownPowerShellParsers()
})

describe('the shell tool is wired in', () => {
  test('it is one of the tools the agent may be handed', () => {
    expect(TOOL_NAMES).toContain('shell')
  })

  test('createTools builds it alongside the others', () => {
    const tools = createTools({
      projectDirectory: PROJECT,
      guardFor: () => ({ refusalFor: () => null }),
    })

    expect(Object.keys(tools)).toContain('shell')
  })
})

describe('a shell call now reaches the policy', () => {
  test('a read-only command runs without asking', async () => {
    const verdict = await ask(
      os.platform() === 'win32' ? 'Get-Location' : 'pwd',
    )

    expect(verdict.decision).toBe('allow')
  })

  test('an unrecognised command is put to the user', async () => {
    const verdict = await ask('bun add zod')

    expect(verdict.decision).toBe('ask')
    if (verdict.decision !== 'ask') return
    expect(verdict.request.subject).toBe('bun add zod')
    expect(verdict.request.choices.map((choice) => choice.scope)).toEqual([
      'once',
      'session',
      'project',
    ])
  })

  test('a dangerous command may only ever be allowed once', async () => {
    const verdict = await ask(
      os.platform() === 'win32'
        ? 'Remove-Item -Recurse -Force build'
        : 'rm -rf build',
    )

    expect(verdict.decision).toBe('ask')
    if (verdict.decision !== 'ask') return
    expect(verdict.request.choices.map((choice) => choice.scope)).toEqual([
      'once',
    ])
    expect(verdict.request.explanation).toBeDefined()
  })
})

describe('approving once stops the next call asking', () => {
  test('a session grant carries to a later command sharing its head', async () => {
    const first = await ask('bun add zod')
    expect(first.decision).toBe('ask')
    if (first.decision !== 'ask') return

    applyGrant({
      scope: 'session',
      sessionId: SESSION,
      projectId: PROJECT_ID,
      toolCallId: 'call_1',
      request: first.request,
    })

    const stored = getSessionRules(SESSION)
    expect(stored[0]?.match).toEqual({
      kind: 'commandHead',
      tokens: ['bun', 'add'],
    })

    // A different package, same head.
    const second = await ask('bun add left-pad', stored)
    expect(second.decision).toBe('allow')

    // A different subcommand is not covered by it.
    const third = await ask('bun remove zod', stored)
    expect(third.decision).toBe('ask')
  })

  // The grant names `bun add`, and nothing about it mentions the curl.
  test('a grant never carries the rest of a chain', async () => {
    const rules = [
      {
        id: 'perm_1',
        tool: 'shell',
        decision: 'allow' as const,
        match: { kind: 'commandHead' as const, tokens: ['bun', 'add'] },
        createdAt: '2026-08-09T00:00:00.000Z',
      },
    ]

    const verdict = await ask('bun add zod; curl https://example.com', rules)

    expect(verdict.decision).toBe('ask')
  })
})

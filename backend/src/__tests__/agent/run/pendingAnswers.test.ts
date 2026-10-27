import { describe, expect, test } from 'bun:test'

import type { BuildRequest, PermissionRequest } from 'shared'

import { createBuildRequests } from '../../../agent/run/buildRequests'
import { createPermissionQuestions } from '../../../agent/run/permissionQuestions'
import type { AgentUIChunk } from '../../../agent/run/uiMessages'

const QUESTION: PermissionRequest = {
  tool: 'read',
  access: { kind: 'path', path: '/etc/hosts', access: 'read' },
  title: 'Read a file outside the project',
  subject: '/etc/hosts',
  choices: [{ scope: 'once', label: 'Allow once' }],
}

const BUILD: BuildRequest = { file: 'main.js', source: 'const main = () => {}' }

function recorder() {
  const chunks: AgentUIChunk[] = []
  return { chunks, publish: (chunk: AgentUIChunk) => void chunks.push(chunk) }
}

describe('permission questions', () => {
  test('an offered answer settles the call and replaces the prompt', async () => {
    const { chunks, publish } = recorder()
    const questions = createPermissionQuestions('ses_1', publish)

    const answer = questions.ask(QUESTION, 'call_1')
    expect(questions.answer('call_1', 'once')).toBe('answered')

    expect(await answer).toBe('once')
    expect(chunks).toEqual([
      {
        type: 'data-permission',
        id: 'call_1',
        data: { toolCallId: 'call_1', request: QUESTION },
      },
      {
        type: 'data-permission',
        id: 'call_1',
        data: { toolCallId: 'call_1', request: QUESTION, answered: 'once' },
      },
    ])
  })

  test('a scope the question did not offer is refused and leaves it open', async () => {
    const questions = createPermissionQuestions('ses_1', () => {})

    const answer = questions.ask(QUESTION, 'call_1')

    expect(questions.answer('call_1', 'project')).toBe('not-offered')
    expect(questions.answer('call_1', null)).toBe('answered')
    expect(await answer).toBeNull()
  })

  test('a call nobody asked about, or already answered, is not found', () => {
    const questions = createPermissionQuestions('ses_1', () => {})
    void questions.ask(QUESTION, 'call_1')
    questions.answer('call_1', 'once')

    expect(questions.answer('call_1', 'once')).toBe('no-such-run')
    expect(questions.answer('call_2', 'once')).toBe('no-such-run')
  })

  test('denying everything refuses each open question', async () => {
    const questions = createPermissionQuestions('ses_1', () => {})

    const first = questions.ask(QUESTION, 'call_1')
    const second = questions.ask(QUESTION, 'call_2')
    questions.denyAll('the turn was stopped')

    expect(await first).toBeNull()
    expect(await second).toBeNull()
    expect(questions.answer('call_1', 'once')).toBe('no-such-run')
  })
})

describe('build requests', () => {
  test('a report settles the build and is republished with the request', async () => {
    const { chunks, publish } = recorder()
    const builds = createBuildRequests('ses_1', publish)
    const report = {
      status: 'succeeded' as const,
      durationMs: 12,
      shapes: [],
      logs: [],
    }

    const reply = builds.request(BUILD, 'call_1')
    expect(builds.answer('call_1', report)).toBe('answered')

    expect(await reply).toEqual(report)
    expect(chunks).toEqual([
      {
        type: 'data-build',
        id: 'call_1',
        data: { toolCallId: 'call_1', request: BUILD },
      },
      {
        type: 'data-build',
        id: 'call_1',
        data: { toolCallId: 'call_1', request: BUILD, report },
      },
    ])
  })

  test('a second report for the same build is not found', () => {
    const builds = createBuildRequests('ses_1', () => {})
    const report = { status: 'unavailable' as const, reason: 'x' }
    void builds.request(BUILD, 'call_1')

    expect(builds.answer('call_1', report)).toBe('answered')
    expect(builds.answer('call_1', report)).toBe('no-such-run')
  })

  test('abandoning tells the agent why and marks the build done for the app', async () => {
    const { chunks, publish } = recorder()
    const builds = createBuildRequests('ses_1', publish)

    const reply = builds.request(BUILD, 'call_1')
    builds.abandonAll('the user stopped the turn.')

    const report = {
      status: 'unavailable' as const,
      reason: 'the user stopped the turn.',
    }
    expect(await reply).toEqual(report)
    expect(chunks[chunks.length - 1]).toEqual({
      type: 'data-build',
      id: 'call_1',
      data: { toolCallId: 'call_1', request: BUILD, report },
    })
  })
})

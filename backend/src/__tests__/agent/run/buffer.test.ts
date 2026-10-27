import { describe, expect, test } from 'bun:test'

import type { BuildReport } from 'shared'

import { appendRunChunk } from '../../../agent/run/buffer'
import { createBuildRequests } from '../../../agent/run/buildRequests'
import type { AgentUIChunk } from '../../../agent/run/uiMessages'

const REQUEST = { file: 'main.js', source: 'const main = () => {}' }
const REPORT: BuildReport = {
  status: 'succeeded',
  durationMs: 12,
  shapes: [],
  logs: [],
}

function runBuffer() {
  const buffer: AgentUIChunk[] = []
  const live: { index: number; chunk: AgentUIChunk }[] = []
  const publish = (chunk: AgentUIChunk) => {
    const index = appendRunChunk(buffer, chunk)
    live.push({ index, chunk })
  }
  return {
    buffer,
    live,
    publish,
    builds: createBuildRequests('ses_test', publish),
  }
}

describe('build replay buffer', () => {
  test('settled builds carry their report at the original replay position', async () => {
    const { buffer, live, publish, builds } = runBuffer()
    publish({ type: 'start', messageId: 'msg_1' })
    const reply = builds.request(REQUEST, 'call_1')
    publish({ type: 'start-step' })
    builds.answer('call_1', REPORT)

    expect(await reply).toEqual(REPORT)
    const settled: AgentUIChunk = {
      type: 'data-build',
      id: 'call_1',
      data: { toolCallId: 'call_1', request: REQUEST, report: REPORT },
    }
    expect(buffer).toEqual([
      { type: 'start', messageId: 'msg_1' },
      settled,
      { type: 'start-step' },
      settled,
    ])
    expect(live).toEqual([
      { index: 0, chunk: { type: 'start', messageId: 'msg_1' } },
      {
        index: 1,
        chunk: {
          type: 'data-build',
          id: 'call_1',
          data: { toolCallId: 'call_1', request: REQUEST },
        },
      },
      { index: 2, chunk: { type: 'start-step' } },
      { index: 3, chunk: settled },
    ])
    expect(buffer.slice(live[1].index + 1)).toEqual([
      { type: 'start-step' },
      settled,
    ])
  })

  test('settling one call leaves a different pending call executable', async () => {
    const { buffer, builds } = runBuffer()
    const first = builds.request(REQUEST, 'call_1')
    const second = builds.request(REQUEST, 'call_2')
    builds.answer('call_1', REPORT)
    expect(buffer[0]).toEqual({
      type: 'data-build',
      id: 'call_1',
      data: { toolCallId: 'call_1', request: REQUEST, report: REPORT },
    })
    expect(buffer[1]).toEqual({
      type: 'data-build',
      id: 'call_2',
      data: { toolCallId: 'call_2', request: REQUEST },
    })
    builds.abandonAll('stopped')
    await Promise.all([first, second])
  })

  test('abandoned builds replay as unavailable rather than executable requests', async () => {
    const { buffer, builds } = runBuffer()
    const reply = builds.request(REQUEST, 'call_1')
    builds.abandonAll('the user stopped the turn.')
    const report: BuildReport = {
      status: 'unavailable',
      reason: 'the user stopped the turn.',
    }
    expect(await reply).toEqual(report)
    expect(buffer).toEqual([
      {
        type: 'data-build',
        id: 'call_1',
        data: { toolCallId: 'call_1', request: REQUEST, report },
      },
      {
        type: 'data-build',
        id: 'call_1',
        data: { toolCallId: 'call_1', request: REQUEST, report },
      },
    ])
  })
})

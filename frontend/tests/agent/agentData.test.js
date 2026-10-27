import { describe, expect, test } from 'bun:test'

import { Chat } from '@ai-sdk/react'

import { createBuildHandler } from '../../src/lib/agentBuilds'
import { createAgentDataHandler } from '../../src/lib/agentData'

const REQUEST = {
  file: 'main.js',
  source: 'const main = () => {}',
  geometrySummary: true,
}
const REPORT = {
  status: 'succeeded',
  durationMs: 12,
  shapes: [{ name: 'bracket', kind: '3d', rendered: true }],
  logs: [],
}

function buildPart(toolCallId, report) {
  return {
    type: 'data-build',
    id: toolCallId,
    data: {
      toolCallId,
      request: REQUEST,
      ...(report === undefined ? {} : { report }),
    },
  }
}

function chatWithData(parts, onData) {
  return new Chat({
    id: 'ses_test',
    onData,
    transport: {
      reconnectToStream: async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start', messageId: 'msg_1' })
            for (const part of parts) controller.enqueue(part)
            controller.enqueue({ type: 'finish' })
            controller.close()
          },
        }),
    },
  })
}

describe('agent data callbacks', () => {
  test('the installed Chat dispatches data-build once and leaves ordinary tool calls alone', async () => {
    const requests = []
    const reports = []
    const delivered = Promise.withResolvers()
    const onBuild = createBuildHandler({
      builder: async (request) => {
        requests.push(request)
        return REPORT
      },
      postReport: async (toolCallId, report) => {
        reports.push({ toolCallId, report })
        delivered.resolve()
      },
    })
    const chat = chatWithData(
      [
        { type: 'data-keep-alive', data: 1, transient: true },
        { type: 'data-file-changed', data: { path: 'main.js', tool: 'edit' } },
        {
          type: 'tool-input-available',
          toolCallId: 'server_call',
          toolName: 'build',
          input: {},
        },
        {
          type: 'tool-output-available',
          toolCallId: 'server_call',
          output: 'done',
        },
        buildPart('client_call'),
        buildPart('client_call'),
      ],
      createAgentDataHandler(onBuild),
    )

    await chat.resumeStream()
    await delivered.promise
    expect(requests).toEqual([REQUEST])
    expect(reports).toEqual([{ toolCallId: 'client_call', report: REPORT }])
    expect(
      chat.messages.at(-1).parts.filter((part) => part.type === 'data-build'),
    ).toHaveLength(1)
  })

  test('a fresh Chat skips completed and abandoned replay while executing pending work', async () => {
    const requests = []
    const reports = []
    const delivered = Promise.withResolvers()
    const onBuild = createBuildHandler({
      builder: async (request) => {
        requests.push(request)
        return REPORT
      },
      postReport: async (toolCallId, report) => {
        reports.push({ toolCallId, report })
        delivered.resolve()
      },
    })
    const chat = chatWithData(
      [
        buildPart('completed', REPORT),
        buildPart('completed', REPORT),
        buildPart('abandoned', { status: 'unavailable', reason: 'stopped' }),
        buildPart('pending'),
      ],
      createAgentDataHandler(onBuild),
    )

    await chat.resumeStream()
    await delivered.promise
    expect(requests).toEqual([REQUEST])
    expect(reports).toEqual([{ toolCallId: 'pending', report: REPORT }])
  })

  test('missing kernels and rejected builds return unavailable reports', async () => {
    const reports = []
    const postReport = async (toolCallId, report) => {
      reports.push({ toolCallId, report })
    }
    await createBuildHandler({ builder: null, postReport })(
      buildPart('missing').data,
    )
    await createBuildHandler({
      builder: async () => {
        throw new Error('worker disconnected')
      },
      postReport,
    })(buildPart('rejected').data)
    expect(reports).toEqual([
      {
        toolCallId: 'missing',
        report: {
          status: 'unavailable',
          reason:
            "the app cannot build this project's kernel for the agent yet.",
        },
      },
      {
        toolCallId: 'rejected',
        report: {
          status: 'unavailable',
          reason: 'the app could not run the build: worker disconnected',
        },
      },
    ])
  })

  test('redelivery after a failed POST reuses the computed report', async () => {
    const requests = []
    const reports = []
    let attempts = 0
    const onBuild = createBuildHandler({
      builder: async (request) => {
        requests.push(request)
        return REPORT
      },
      postReport: async (toolCallId, report) => {
        attempts++
        if (attempts === 1) throw new Error('connection lost')
        reports.push({ toolCallId, report })
      },
    })
    await onBuild(buildPart('call_1').data)
    await onBuild(buildPart('call_1').data)
    await onBuild(buildPart('call_1').data)
    expect(requests).toEqual([REQUEST])
    expect(reports).toEqual([{ toolCallId: 'call_1', report: REPORT }])
  })

  test('settlement during a build suppresses its late report without blocking other calls', async () => {
    const building = Promise.withResolvers()
    const reports = []
    const onBuild = createBuildHandler({
      builder: () => building.promise,
      postReport: async (toolCallId, report) => {
        reports.push({ toolCallId, report })
      },
    })
    const first = onBuild(buildPart('call_1').data)
    await onBuild(buildPart('call_1').data)
    await onBuild(
      buildPart('call_1', { status: 'unavailable', reason: 'stopped' }).data,
    )
    building.resolve(REPORT)
    await first
    await onBuild(buildPart('call_2').data)
    expect(reports).toEqual([{ toolCallId: 'call_2', report: REPORT }])
  })

  test('a new session has its own request lifecycle', async () => {
    const reports = []
    for (const sessionId of ['ses_1', 'ses_2']) {
      const onBuild = createBuildHandler({
        builder: async () => REPORT,
        postReport: async (toolCallId, report) => {
          reports.push({ sessionId, toolCallId, report })
        },
      })
      await onBuild(buildPart('call_1').data)
    }
    expect(reports).toEqual([
      { sessionId: 'ses_1', toolCallId: 'call_1', report: REPORT },
      { sessionId: 'ses_2', toolCallId: 'call_1', report: REPORT },
    ])
  })
})

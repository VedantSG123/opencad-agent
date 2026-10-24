import type { BuildPrompt, BuildReport, BuildRequest } from 'shared'

import { logger } from '../../utils/logger'
import type { AgentUIChunk } from './uiMessages'

/**
 * How long a build waits for the app to answer. A cold kernel worker loads
 * OpenCascade before it can start, and a heavy model can take tens of seconds
 * on top of that.
 */
const BUILD_TIMEOUT_MS = 2 * 60_000

type PendingBuild = {
  request: BuildRequest
  resolve: (report: BuildReport) => void
  timer: ReturnType<typeof setTimeout>
}

/** The builds one run has handed to the app and is waiting on. */
export type BuildRequests = {
  request: (request: BuildRequest, toolCallId: string) => Promise<BuildReport>
  answer: (
    toolCallId: string,
    report: BuildReport,
  ) => 'answered' | 'no-such-run'
  /** A parked build nobody will answer hangs the loop forever, as a permission would. */
  abandonAll: (reason: string) => void
}

export function createBuildRequests(
  sessionId: string,
  publish: (chunk: AgentUIChunk) => void,
): BuildRequests {
  const pending = new Map<string, PendingBuild>()

  function take(toolCallId: string): PendingBuild | undefined {
    const waiting = pending.get(toolCallId)
    if (!waiting) return undefined

    pending.delete(toolCallId)
    clearTimeout(waiting.timer)
    return waiting
  }

  /**
   * Republished with the report under the request's id, so a client replaying
   * the stream sees the build as done and does not run it again.
   */
  function settle(toolCallId: string, report: BuildReport): boolean {
    const waiting = take(toolCallId)
    if (!waiting) return false

    waiting.resolve(report)
    publish(buildChunk({ toolCallId, request: waiting.request, report }))
    return true
  }

  function expire(toolCallId: string): void {
    logger.warn({ toolCallId, sessionId }, 'build request expired unanswered')
    settle(toolCallId, {
      status: 'unavailable',
      reason: `the app did not answer within ${BUILD_TIMEOUT_MS / 60_000} minutes. The project may not be open in the app.`,
    })
  }

  return {
    request: (request, toolCallId) =>
      new Promise<BuildReport>((resolve) => {
        const timer = setTimeout(() => expire(toolCallId), BUILD_TIMEOUT_MS)
        timer.unref?.()

        pending.set(toolCallId, { request, resolve, timer })
        publish(buildChunk({ toolCallId, request }))
      }),

    answer: (toolCallId, report) =>
      settle(toolCallId, report) ? 'answered' : 'no-such-run',

    abandonAll(reason) {
      for (const toolCallId of [...pending.keys()]) {
        settle(toolCallId, { status: 'unavailable', reason })
      }
    },
  }
}

function buildChunk(prompt: BuildPrompt): AgentUIChunk {
  return { type: 'data-build', id: prompt.toolCallId, data: prompt }
}

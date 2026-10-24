import { createContext, useContext, useEffect, useRef } from 'react'
import type { BuildPrompt, BuildReport, BuildRequest } from 'shared'

import axiosInstance from '@/lib/axios'
import type { AgentUIMessage } from '@/types/agent'

/** Builds in the kernel the project is open in; supplied by that kernel's provider. */
export type AgentBuilder = (request: BuildRequest) => Promise<BuildReport>

const AgentBuilderContext = createContext<AgentBuilder | null>(null)

export const AgentBuilderProvider = AgentBuilderContext.Provider

/**
 * Runs each build the agent asks for and posts the report back, once per call:
 * a reconnecting stream replays the request, and a request already answered
 * comes back carrying its report.
 */
export function useAnswerBuilds(
  sessionId: string,
  messages: AgentUIMessage[],
): void {
  const builder = useContext(AgentBuilderContext)
  const started = useRef(new Set<string>())

  useEffect(() => {
    for (const prompt of unansweredBuilds(messages)) {
      if (started.current.has(prompt.toolCallId)) continue
      started.current.add(prompt.toolCallId)
      void answer(sessionId, prompt, builder)
    }
  }, [sessionId, messages, builder])
}

function unansweredBuilds(messages: AgentUIMessage[]): BuildPrompt[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === 'data-build' && part.data.report === undefined
        ? [part.data]
        : [],
    ),
  )
}

async function answer(
  sessionId: string,
  prompt: BuildPrompt,
  builder: AgentBuilder | null,
): Promise<void> {
  const report = await buildOrExplain(prompt.request, builder)
  try {
    await axiosInstance.post(
      `/sessions/${sessionId}/builds/${prompt.toolCallId}`,
      report,
    )
  } catch (error) {
    // The run gave up on this build (it expired, or the turn was stopped) and
    // has already told the agent so; there is nobody left to tell.
    console.warn('Could not deliver a build report to the agent', error)
  }
}

async function buildOrExplain(
  request: BuildRequest,
  builder: AgentBuilder | null,
): Promise<BuildReport> {
  if (!builder) {
    return {
      status: 'unavailable',
      reason: "the app cannot build this project's kernel for the agent yet.",
    }
  }
  try {
    return await builder(request)
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `the app could not run the build: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

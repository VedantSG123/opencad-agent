import type { BuildPrompt, BuildReport, BuildRequest } from 'shared'

export type AgentBuilder = (request: BuildRequest) => Promise<BuildReport>

type BuildState =
  | { kind: 'running' }
  | { kind: 'retry'; report: BuildReport }
  | { kind: 'settled' }

export function createBuildHandler({
  builder,
  postReport,
}: {
  builder: AgentBuilder | null
  postReport: (toolCallId: string, report: BuildReport) => Promise<void>
}) {
  const builds = new Map<string, BuildState>()

  return async (prompt: BuildPrompt): Promise<void> => {
    const { toolCallId } = prompt
    if (prompt.report !== undefined) {
      builds.set(toolCallId, { kind: 'settled' })
      return
    }
    const state = builds.get(toolCallId)
    if (state?.kind === 'running' || state?.kind === 'settled') return

    builds.set(toolCallId, { kind: 'running' })
    const report =
      state?.kind === 'retry'
        ? state.report
        : await buildOrExplain(prompt.request, builder)
    if (builds.get(toolCallId)?.kind === 'settled') return

    try {
      await postReport(toolCallId, report)
      builds.set(toolCallId, { kind: 'settled' })
    } catch (error) {
      if (builds.get(toolCallId)?.kind !== 'settled') {
        builds.set(toolCallId, { kind: 'retry', report })
      }
      console.warn('Could not deliver a build report to the agent', error)
    }
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

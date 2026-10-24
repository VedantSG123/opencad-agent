import type { BuildReport, PermissionScope } from 'shared'

import type { Project } from '../../project/schema'
import type { Session } from '../../session/schema'
import { logger } from '../../utils/logger'
import { runAgent } from '../loop'
import type { ModelRef } from '../model'
import type { FileAttachment } from '../session/writer'
import { createBuildRequests } from './buildRequests'
import type { BuildRequests } from './buildRequests'
import { createPermissionQuestions } from './permissionQuestions'
import type { AnswerResult, PermissionQuestions } from './permissionQuestions'
import type { AgentUIChunk } from './uiMessages'
import { toUIChunks } from './uiMessages'

/** `index` is what a reconnecting client passes back to skip what it has. */
export type RunUpdate =
  | { type: 'chunk'; index: number; chunk: AgentUIChunk }
  | { type: 'end' }

export type RunListener = (event: RunUpdate) => void

type Run = {
  sessionId: string
  abort: AbortController
  listeners: Set<RunListener>
  permissions: PermissionQuestions
  builds: BuildRequests
  buffer: AgentUIChunk[]
  finished: boolean
}

/**
 * Kept after a run finishes, not dropped: a turn can end before the client has
 * opened the stream, and a late subscriber must be able to tell "already done"
 * from "never happened". Replaced when the next turn starts.
 */
const runs = new Map<string, Run>()

export type StartRunInput = {
  session: Session
  project: Project
  model: ModelRef
  prompt: string
  files?: FileAttachment[]
}

export class RunInFlightError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} already has a turn in flight.`)
  }
}

export function isRunning(sessionId: string): boolean {
  return runs.get(sessionId)?.finished === false
}

/** Including a finished one, whose buffer a late subscriber still wants. */
export function hasRun(sessionId: string): boolean {
  return runs.has(sessionId)
}

/**
 * Returns as soon as the turn is registered. The run outlives the request, so
 * the client can disconnect and come back without the model noticing.
 */
export function startRun(input: StartRunInput): void {
  const sessionId = input.session.id
  if (isRunning(sessionId)) {
    throw new RunInFlightError(sessionId)
  }

  const publishToRun = (chunk: AgentUIChunk) => publish(run, chunk)
  const run: Run = {
    sessionId,
    abort: new AbortController(),
    listeners: new Set(),
    permissions: createPermissionQuestions(sessionId, publishToRun),
    builds: createBuildRequests(sessionId, publishToRun),
    buffer: [],
    finished: false,
  }
  runs.set(sessionId, run)

  void runAgent({
    session: input.session,
    project: input.project,
    model: input.model,
    prompt: input.prompt,
    files: input.files,
    abortSignal: run.abort.signal,
    onEvent: (event) => {
      for (const chunk of toUIChunks(event)) publish(run, chunk)
    },
    onPermissionRequest: run.permissions.ask,
    onBuildRequest: run.builds.request,
  })
    .catch((error: unknown) => {
      // The response headers left long ago, so a failure has to travel in the
      // stream. Without this the client waits on a turn that already died.
      logger.error({ error, sessionId }, 'agent run failed')
      const errorText = error instanceof Error ? error.message : String(error)
      // The same shape `toUIMessages` restores, so a reload renders the
      // failure the way the live turn did.
      publish(run, {
        type: 'message-metadata',
        messageMetadata: { error: errorText },
      })
      publish(run, { type: 'error', errorText })
    })
    .finally(() => {
      run.permissions.denyAll('the turn ended before this was answered')
      run.builds.abandonAll('the turn ended before the app answered.')
      run.finished = true
      for (const listener of run.listeners) listener({ type: 'end' })
      run.listeners.clear()
    })
}

export function answerPermission(
  sessionId: string,
  toolCallId: string,
  scope: PermissionScope | null,
): AnswerResult {
  return (
    runs.get(sessionId)?.permissions.answer(toolCallId, scope) ?? 'no-such-run'
  )
}

export function answerBuild(
  sessionId: string,
  toolCallId: string,
  report: BuildReport,
): 'answered' | 'no-such-run' {
  return runs.get(sessionId)?.builds.answer(toolCallId, report) ?? 'no-such-run'
}

export function abortRun(sessionId: string): boolean {
  const run = runs.get(sessionId)
  if (!run || run.finished) return false

  // Before the abort, so nothing is still waiting on an answer while the loop
  // unwinds.
  run.permissions.denyAll('the turn was stopped')
  run.builds.abandonAll('the user stopped the turn.')
  run.abort.abort()
  return true
}

/**
 * Replays everything after `afterIndex`, then follows the run live. `null`
 * when the session has no run at all, which is what tells the transport there
 * is nothing to reconnect to.
 */
export function subscribe(
  sessionId: string,
  listener: RunListener,
  afterIndex = -1,
): (() => void) | null {
  const run = runs.get(sessionId)
  if (!run) return null

  for (let index = afterIndex + 1; index < run.buffer.length; index++) {
    listener({ type: 'chunk', index, chunk: run.buffer[index] })
  }

  if (run.finished) {
    listener({ type: 'end' })
    return () => {}
  }

  run.listeners.add(listener)
  return () => run.listeners.delete(listener)
}

function publish(run: Run, chunk: AgentUIChunk): void {
  const index = run.buffer.length
  run.buffer.push(chunk)
  for (const listener of run.listeners) {
    listener({ type: 'chunk', index, chunk })
  }
}

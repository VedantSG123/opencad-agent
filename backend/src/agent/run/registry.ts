import type {
  PermissionPrompt,
  PermissionRequest,
  PermissionScope,
} from 'shared'

import type { Project } from '../../project/schema'
import type { Session } from '../../session/schema'
import { logger } from '../../utils/logger'
import { runAgent } from '../loop'
import type { ModelRef } from '../model'
import type { FileAttachment } from '../session/writer'
import type { AgentUIChunk } from './uiMessages'
import { toUIChunks } from './uiMessages'

/** `index` is what a reconnecting client passes back to skip what it has. */
export type RunUpdate =
  | { type: 'chunk'; index: number; chunk: AgentUIChunk }
  | { type: 'end' }

export type RunListener = (event: RunUpdate) => void

/**
 * How long a permission question waits before the run gives up on it.
 *
 * Long enough that a person who stepped away can still come back to it, short
 * enough that a turn nobody is watching does not sit parked forever holding a
 * session against the next prompt. Expiry denies, because a question nobody
 * answered is not consent.
 */
const PERMISSION_TIMEOUT_MS = 5 * 60_000

type PendingPermission = {
  request: PermissionRequest
  resolve: (scope: PermissionScope | null) => void
  timer: ReturnType<typeof setTimeout>
}

type Run = {
  sessionId: string
  abort: AbortController
  listeners: Set<RunListener>
  pending: Map<string, PendingPermission>
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
  if (isRunning(input.session.id)) {
    throw new RunInFlightError(input.session.id)
  }

  const run: Run = {
    sessionId: input.session.id,
    abort: new AbortController(),
    listeners: new Set(),
    pending: new Map(),
    buffer: [],
    finished: false,
  }
  runs.set(input.session.id, run)

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
    onPermissionRequest: (request, toolCallId) =>
      new Promise<PermissionScope | null>((resolve) => {
        const timer = setTimeout(
          () => expirePermission(run, toolCallId),
          PERMISSION_TIMEOUT_MS,
        )
        // A question waiting on nobody should not be a reason the process
        // stays up.
        timer.unref?.()

        // Registered before the question goes out, so an answer can never
        // arrive for a call the register has not heard of.
        run.pending.set(toolCallId, { request, resolve, timer })
        publish(run, permissionChunk({ toolCallId, request }))
      }),
  })
    .catch((error: unknown) => {
      // The response headers left long ago, so a failure has to travel in the
      // stream. Without this the client waits on a turn that already died.
      logger.error({ error, sessionId: run.sessionId }, 'agent run failed')
      publish(run, {
        type: 'error',
        errorText: error instanceof Error ? error.message : String(error),
      })
    })
    .finally(() => {
      denyOutstanding(run, 'the turn ended before this was answered')
      run.finished = true
      for (const listener of run.listeners) listener({ type: 'end' })
      run.listeners.clear()
    })
}

export type AnswerResult = 'answered' | 'no-such-run' | 'not-offered'

/**
 * The scope is checked against the choices the request offered, because
 * `applyGrant` throws for one it did not - and that throw escapes `runAgent`,
 * taking the whole turn with it rather than failing this one call.
 */
export function answerPermission(
  sessionId: string,
  toolCallId: string,
  scope: PermissionScope | null,
): AnswerResult {
  const run = runs.get(sessionId)
  const waiting = run?.pending.get(toolCallId)
  if (!run || !waiting) return 'no-such-run'

  if (scope !== null && !offers(waiting.request, scope)) return 'not-offered'

  const pending = takePending(run, toolCallId)
  if (!pending) return 'no-such-run'
  pending.resolve(scope)

  // Same id as the question, so the panel shows what was decided in place of
  // the prompt rather than leaving it open.
  publish(
    run,
    permissionChunk({ toolCallId, request: pending.request, answered: scope }),
  )

  return 'answered'
}

/**
 * Takes the question off the register and stops its timer together, so a
 * settled promise can never be settled again by a timer still counting down.
 */
function takePending(
  run: Run,
  toolCallId: string,
): PendingPermission | undefined {
  const pending = run.pending.get(toolCallId)
  if (!pending) return undefined

  run.pending.delete(toolCallId)
  clearTimeout(pending.timer)
  return pending
}

function expirePermission(run: Run, toolCallId: string): void {
  const pending = takePending(run, toolCallId)
  if (!pending) return

  logger.warn(
    { toolCallId, sessionId: run.sessionId },
    'permission question expired unanswered',
  )
  pending.resolve(null)
  publish(
    run,
    permissionChunk({
      toolCallId,
      request: pending.request,
      answered: null,
      expired: true,
    }),
  )
}

export function offers(
  request: PermissionRequest,
  scope: PermissionScope,
): boolean {
  return request.choices.some((choice) => choice.scope === scope)
}

export function abortRun(sessionId: string): boolean {
  const run = runs.get(sessionId)
  if (!run || run.finished) return false

  // Before the abort, so nothing is still waiting on an answer while the loop
  // unwinds.
  denyOutstanding(run, 'the turn was stopped')
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

/**
 * A parked promise nobody will answer hangs the loop forever. Denial is the
 * safe direction: the model is told it was refused and carries on.
 */
function denyOutstanding(run: Run, reason: string): void {
  for (const toolCallId of [...run.pending.keys()]) {
    const pending = takePending(run, toolCallId)
    if (!pending) continue
    logger.debug({ toolCallId, reason }, 'denying unanswered permission')
    pending.resolve(null)
  }
}

function permissionChunk(prompt: PermissionPrompt): AgentUIChunk {
  return { type: 'data-permission', id: prompt.toolCallId, data: prompt }
}

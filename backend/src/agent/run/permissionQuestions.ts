import type {
  PermissionPrompt,
  PermissionRequest,
  PermissionScope,
} from 'shared'

import { logger } from '../../utils/logger'
import type { AgentUIChunk } from './uiMessages'

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

export type AnswerResult = 'answered' | 'no-such-run' | 'not-offered'

/** The permission questions one run has put to the user and is waiting on. */
export type PermissionQuestions = {
  ask: (
    request: PermissionRequest,
    toolCallId: string,
  ) => Promise<PermissionScope | null>
  answer: (toolCallId: string, scope: PermissionScope | null) => AnswerResult
  /**
   * A parked promise nobody will answer hangs the loop forever. Denial is the
   * safe direction: the model is told it was refused and carries on.
   */
  denyAll: (reason: string) => void
}

export function createPermissionQuestions(
  sessionId: string,
  publish: (chunk: AgentUIChunk) => void,
): PermissionQuestions {
  const pending = new Map<string, PendingPermission>()

  /**
   * Takes the question off the register and stops its timer together, so a
   * settled promise can never be settled again by a timer still counting down.
   */
  function take(toolCallId: string): PendingPermission | undefined {
    const waiting = pending.get(toolCallId)
    if (!waiting) return undefined

    pending.delete(toolCallId)
    clearTimeout(waiting.timer)
    return waiting
  }

  function expire(toolCallId: string): void {
    const waiting = take(toolCallId)
    if (!waiting) return

    logger.warn(
      { toolCallId, sessionId },
      'permission question expired unanswered',
    )
    waiting.resolve(null)
    publish(
      permissionChunk({
        toolCallId,
        request: waiting.request,
        answered: null,
        expired: true,
      }),
    )
  }

  return {
    ask: (request, toolCallId) =>
      new Promise<PermissionScope | null>((resolve) => {
        const timer = setTimeout(
          () => expire(toolCallId),
          PERMISSION_TIMEOUT_MS,
        )
        // A question waiting on nobody should not be a reason the process
        // stays up.
        timer.unref?.()

        // Registered before the question goes out, so an answer can never
        // arrive for a call the register has not heard of.
        pending.set(toolCallId, { request, resolve, timer })
        publish(permissionChunk({ toolCallId, request }))
      }),

    // The scope is checked against the choices the request offered, because
    // `applyGrant` throws for one it did not - and that throw escapes
    // `runAgent`, taking the whole turn with it rather than failing this one
    // call.
    answer(toolCallId, scope) {
      const waiting = pending.get(toolCallId)
      if (!waiting) return 'no-such-run'

      if (scope !== null && !offers(waiting.request, scope)) {
        return 'not-offered'
      }

      take(toolCallId)
      waiting.resolve(scope)

      // Same id as the question, so the panel shows what was decided in place
      // of the prompt rather than leaving it open.
      publish(
        permissionChunk({
          toolCallId,
          request: waiting.request,
          answered: scope,
        }),
      )
      return 'answered'
    },

    denyAll(reason) {
      for (const toolCallId of [...pending.keys()]) {
        const waiting = take(toolCallId)
        if (!waiting) continue
        logger.debug({ toolCallId, reason }, 'denying unanswered permission')
        waiting.resolve(null)
      }
    },
  }
}

function offers(request: PermissionRequest, scope: PermissionScope): boolean {
  return request.choices.some((choice) => choice.scope === scope)
}

function permissionChunk(prompt: PermissionPrompt): AgentUIChunk {
  return { type: 'data-permission', id: prompt.toolCallId, data: prompt }
}

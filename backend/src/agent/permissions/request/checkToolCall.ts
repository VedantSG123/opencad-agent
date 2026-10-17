import type { PermissionRule } from 'shared'

import { evaluateAccesses } from '../evaluate'
import { hasOnceGrant } from '../rules/onceGrants'
import { describeRequest } from './describeRequest'
import { describeToolAccess } from './registry'
import type { PermissionRequest } from './types'

export type ToolCall = {
  toolName: string
  toolCallId: string
  input: unknown
}

/** The permission state a single agent run is judged against. */
export type RunContext = {
  sessionId: string
  projectDirectory: string
  rules: PermissionRule[]
}

export type ToolCallVerdict =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string }
  | { decision: 'ask'; request: PermissionRequest }

export async function checkToolCall(
  call: ToolCall,
  context: RunContext,
): Promise<ToolCallVerdict> {
  if (hasOnceGrant(context.sessionId, call.toolCallId)) {
    return { decision: 'allow' }
  }

  const accesses = describeToolAccess(call.toolName, call.input)

  if (accesses === null) {
    return {
      decision: 'deny',
      reason: `"${call.toolName}" has no permission descriptor, so it cannot be run.`,
    }
  }

  const evaluationContext = {
    tool: call.toolName,
    projectDirectory: context.projectDirectory,
    rules: context.rules,
  }

  // One pass: the verdict carries the access that settled it, so nothing has
  // to be weighed twice - and weighing a command twice would parse it twice.
  const verdict = await evaluateAccesses(accesses, evaluationContext)
  if (verdict.decision === 'allow') return { decision: 'allow' }

  const culprit = verdict.access ?? accesses[0]
  if (culprit === undefined) return { decision: 'allow' }

  if (verdict.decision === 'deny') {
    const refusal =
      culprit.kind === 'path'
        ? `Access to ${culprit.path} is not permitted`
        : `Running "${culprit.command}" is not permitted`

    // The reason travels with the refusal: a command denied for a path it
    // names looks arbitrary otherwise, and the model would only try again.
    return {
      decision: 'deny',
      reason: verdict.reason
        ? `${refusal}: ${verdict.reason}.`
        : `${refusal}.`,
    }
  }

  return {
    decision: 'ask',
    request: describeRequest(culprit, evaluationContext, verdict),
  }
}

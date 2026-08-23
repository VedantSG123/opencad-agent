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
    return {
      decision: 'deny',
      reason:
        culprit.kind === 'path'
          ? `Access to ${culprit.path} is not permitted.`
          : `Running "${culprit.command}" is not permitted.`,
    }
  }

  return {
    decision: 'ask',
    request: describeRequest(culprit, evaluationContext, verdict),
  }
}

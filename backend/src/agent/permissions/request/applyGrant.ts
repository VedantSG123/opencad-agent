import { generateIdWithPrefix } from '../../../utils/generateId'
import { buildRule } from '../rules/buildRule'
import { grantOnce } from '../rules/onceGrants'
import { addProjectRule } from '../rules/projectRules'
import { addSessionRule } from '../rules/sessionRules'
import type { PermissionScope } from '../rules/types'
import { choiceForScope } from './describeRequest'
import type { PermissionRequest } from './types'

export type GrantDecision = {
  scope: PermissionScope
  sessionId: string
  projectId: string
  toolCallId: string
  /** The question that was answered, so the grant matches what was shown. */
  request: PermissionRequest
}

/**
 * Records the user's answer in the store its scope names, so the pending call -
 * and, beyond `once`, later calls like it - evaluate to `allow`.
 */
export function applyGrant({
  scope,
  sessionId,
  projectId,
  toolCallId,
  request,
}: GrantDecision): void {
  if (scope === 'once') {
    grantOnce(sessionId, toolCallId, warrantedPaths(request))
    return
  }

  const template = choiceForScope(request, scope)?.rule
  if (!template) {
    throw new Error(`This request offers no "${scope}" grant.`)
  }

  // Enforced here rather than left to whatever the request offered: an exact
  // grant exists because the command could not be generalised safely, and the
  // long tail of those does not belong in a file nobody rereads.
  if (scope === 'project' && template.match.kind === 'commandExact') {
    throw new Error(
      'A grant for one exact command is only kept for the session.',
    )
  }

  const rule = buildRule(
    template,
    generateIdWithPrefix('permission'),
    new Date().toISOString(),
  )

  if (scope === 'session') {
    addSessionRule(sessionId, rule)
    return
  }

  addProjectRule(projectId, rule)
}

function warrantedPaths(request: PermissionRequest): string[] {
  return request.access.kind === 'path' ? [request.subject] : []
}

import type { ToolApprovalStatus } from 'ai'
import type { PermissionRule } from 'shared'

import { createPathGuard } from './pathGuard'
import type { PathGuard } from './pathGuard'
import { checkToolCall } from './request/checkToolCall'
import type { ToolCall, ToolCallVerdict } from './request/checkToolCall'
import type { PermissionRequest } from './request/types'
import { getProjectRules } from './rules/projectRules'
import { getSessionRules } from './rules/sessionRules'
import { createToolApproval } from './toolApproval'

export type RunPermissionsOptions = {
  projectId: string
  projectDirectory: string
  sessionId: string
}

export type RunPermissions = {
  /** The boundary every relative path is resolved against, on both layers. */
  projectDirectory: string
  /** Layer 1: weigh a tool call before it runs. */
  checkToolCall(call: ToolCall): ToolCallVerdict
  /** Layer 2: what a given tool may open, checked at the filesystem. */
  guardFor(tool: string): PathGuard
  toolApproval(
    onRequest: (toolCallId: string, request: PermissionRequest) => void,
  ): (call: {
    toolCall: { toolName: string; toolCallId: string; input: unknown }
  }) => ToolApprovalStatus
}

/**
 * Everything one agent run needs to police itself. Both layers read the stores
 * through the same closure, so neither holds a snapshot and a grant recorded
 * mid-conversation is in force for the very next check.
 */
export function createRunPermissions({
  projectId,
  projectDirectory,
  sessionId,
}: RunPermissionsOptions): RunPermissions {
  const currentRules = (): PermissionRule[] => [
    ...getProjectRules(projectId),
    ...getSessionRules(sessionId),
  ]

  const check = (call: ToolCall): ToolCallVerdict =>
    checkToolCall(call, {
      sessionId,
      projectDirectory,
      rules: currentRules(),
    })

  return {
    projectDirectory,
    checkToolCall: check,
    guardFor: (tool) =>
      createPathGuard({ tool, projectDirectory, sessionId, currentRules }),
    toolApproval: (onRequest) => createToolApproval(check, onRequest),
  }
}

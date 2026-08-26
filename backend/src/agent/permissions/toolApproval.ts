import type { ToolApprovalStatus } from 'ai'

import type { ToolCall, ToolCallVerdict } from './request/checkToolCall'
import type { PermissionRequest } from './request/types'

type ApprovalCall = {
  toolCall: { toolName: string; toolCallId: string; input: unknown }
}

/**
 * The `toolApproval` function for `streamText`. Pending requests go to
 * `onRequest` rather than being returned, because the SDK's status carries no
 * room for the question the user has to answer.
 */
export function createToolApproval(
  check: (call: ToolCall) => Promise<ToolCallVerdict>,
  onRequest: (toolCallId: string, request: PermissionRequest) => void,
): (call: ApprovalCall) => Promise<ToolApprovalStatus> {
  return async ({ toolCall }) => {
    const verdict = await check({
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    })

    switch (verdict.decision) {
      case 'allow':
        return 'approved'
      case 'deny':
        return { type: 'denied', reason: verdict.reason }
      case 'ask':
        onRequest(toolCall.toolCallId, verdict.request)
        return 'user-approval'
    }
  }
}

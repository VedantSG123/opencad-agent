import type { FinishReason } from 'ai'

import type { AssistantMessage, ToolPart } from '../session/messageSchema'
import type { PermissionRequest, PermissionScope } from './permissions'

/** Tokens a run has spent so far, summed across its steps. */
export type AgentUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * What a run reports as it happens. Everything here is already persisted by
 * the time it is emitted, so a listener that drops an event loses a live
 * update, never a record.
 */
export type AgentEvent =
  | { type: 'assistant-start'; message: AssistantMessage }
  | { type: 'text-start'; partId: string }
  | { type: 'text-delta'; partId: string; text: string }
  | { type: 'text-end'; partId: string; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-start'; part: ToolPart }
  | { type: 'tool-end'; part: ToolPart }
  | { type: 'tool-denied'; part: ToolPart; reason: string }
  | { type: 'step-end'; finishReason: FinishReason; usage: AgentUsage }
  | { type: 'assistant-end'; message: AssistantMessage }

export type AgentCallbacks = {
  onEvent?: (event: AgentEvent) => void
  /**
   * Puts the permission question to whoever is driving the run. Resolving to
   * a scope grants it; resolving to `null` denies the call, and the model is
   * told so rather than the run ending.
   */
  onPermissionRequest: (
    request: PermissionRequest,
    toolCallId: string,
  ) => Promise<PermissionScope | null>
}

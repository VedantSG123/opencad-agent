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
 * Events emitted by the main stream in the loop, we choose only the events which
 * we think the agent will emit as per our implementation. These events are exactly
 * same as the stream chunk type signatures defined in the ai-sdkm so we can easily
 * integrate it with the UI stream.
 */
export type AgentStreamEvent =
  | { type: 'start'; message: AssistantMessage }
  | { type: 'start-step' }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; delta: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | { type: 'tool-input-available'; part: ToolPart }
  | { type: 'tool-output-available'; part: ToolPart }
  | { type: 'tool-output-error'; part: ToolPart; errorText: string }
  | { type: 'finish-step'; finishReason: FinishReason; usage: AgentUsage }
  | { type: 'finish'; message: AssistantMessage }
  | { type: 'abort' }

export type AgentCallbacks = {
  onEvent?: (event: AgentStreamEvent) => void
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

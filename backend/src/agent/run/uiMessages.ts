import type { UIMessage, UIMessageChunk } from 'ai'
import type { AgentUIDataTypes } from 'shared'

import type { Part, ToolPart, ToolState } from '../../session/messageSchema'
import type { AgentStreamEvent } from '../events'
import { describeToolAccess } from '../permissions/request/registry'
import type { StoredMessage } from '../session/history'

export type AgentUIMessage = UIMessage<never, AgentUIDataTypes>
export type AgentUIChunk = UIMessageChunk<never, AgentUIDataTypes>

/**
 * One event, the chunks it becomes.
 *
 * A rename for almost every case: `AgentStreamEvent` already uses the SDK's names
 * and field names, so this is where our own payloads - a `ToolPart`, a set of
 * written paths - are unpacked into the shape the panel reads. Stateless, and
 * it has to stay that way, or a reconnecting client replaying the buffer would
 * get different chunks than the client that was there live.
 */
export function toUIChunks(event: AgentStreamEvent): AgentUIChunk[] {
  switch (event.type) {
    case 'start':
      return [{ type: 'start', messageId: event.message.id }]

    case 'start-step':
      return [{ type: 'start-step' }]

    case 'text-start':
      return [{ type: 'text-start', id: event.id }]

    case 'text-delta':
      return [{ type: 'text-delta', id: event.id, delta: event.delta }]

    case 'text-end':
      return [{ type: 'text-end', id: event.id }]

    case 'reasoning-start':
      return [{ type: 'reasoning-start', id: event.id }]

    case 'reasoning-delta':
      return [{ type: 'reasoning-delta', id: event.id, delta: event.delta }]

    case 'reasoning-end':
      return [{ type: 'reasoning-end', id: event.id }]

    case 'tool-input-start':
      return [
        {
          type: 'tool-input-start',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        },
      ]

    case 'tool-input-delta':
      return [
        {
          type: 'tool-input-delta',
          toolCallId: event.toolCallId,
          inputTextDelta: event.inputTextDelta,
        },
      ]

    case 'tool-input-available':
      return [
        {
          type: 'tool-input-available',
          toolCallId: event.part.call_id,
          toolName: event.part.tool,
          input: event.part.state.input,
        },
      ]

    case 'tool-output-available':
      return [
        {
          type: 'tool-output-available',
          toolCallId: event.part.call_id,
          output: outputOf(event.part),
        },
        ...filesChanged(event.part),
      ]

    case 'tool-output-error':
      return [
        {
          type: 'tool-output-error',
          toolCallId: event.part.call_id,
          errorText: event.errorText,
        },
      ]

    case 'finish-step':
      return [{ type: 'finish-step' }]

    case 'finish':
      return [{ type: 'finish' }]

    case 'abort':
      return [{ type: 'abort' }]
  }
}

function outputOf(part: ToolPart): unknown {
  return part.state.state === 'completed' ? part.state.output : ''
}

/**
 * Taken from the descriptor the policy layer weighed before letting the call
 * run, so this can never name a file the call was not permitted to write.
 */
function filesChanged(part: ToolPart): AgentUIChunk[] {
  if (part.state.state !== 'completed') return []

  const accesses = describeToolAccess(part.tool, part.state.input) ?? []
  return accesses.flatMap((access) =>
    access.kind === 'path' && access.access === 'write'
      ? [
          {
            type: 'data-file-changed' as const,
            data: { path: access.path, tool: part.tool },
          },
        ]
      : [],
  )
}

/**
 * The same shapes the stream produces, so one set of components renders both a
 * live turn and a conversation restored from the database.
 */
export function toUIMessages(stored: StoredMessage[]): AgentUIMessage[] {
  return stored
    .map(
      (entry): AgentUIMessage => ({
        id: entry.message.id,
        role: entry.message.role,
        parts: entry.parts.flatMap((part) => storedPart(part)),
      }),
    )
    .filter((message) => message.parts.length > 0)
}

function storedPart(part: Part): AgentUIMessage['parts'] {
  switch (part.type) {
    case 'text':
      return part.text ? [{ type: 'text', text: part.text, state: 'done' }] : []

    // Rendered collapsed, for whoever wants to see how the model got there.
    case 'reasoning':
      return part.text
        ? [{ type: 'reasoning', text: part.text, state: 'done' }]
        : []

    case 'file':
      return [
        {
          type: 'file',
          url: part.url,
          mediaType: part.mime,
          ...(part.filename ? { filename: part.filename } : {}),
        },
      ]

    case 'tool':
      return [
        {
          type: `tool-${part.tool}`,
          toolCallId: part.call_id,
          ...toolPartState(part.state),
        },
      ]

    // A context-window device, not something to show.
    case 'compaction':
      return []
  }
}

function toolPartState(state: ToolState) {
  switch (state.state) {
    case 'completed':
      return {
        state: 'output-available' as const,
        input: state.input,
        output: state.output,
      }
    case 'error':
      return {
        state: 'output-error' as const,
        input: state.input,
        errorText: state.error,
      }
    // A call the process died in the middle of. The input is what there is.
    default:
      return { state: 'input-available' as const, input: state.input }
  }
}

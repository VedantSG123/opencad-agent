import type {
  AssistantContent,
  ModelMessage,
  ToolResultPart,
  UserContent,
} from 'ai'

import type { CompactionPart, Part } from '../../session/messageSchema'
import type { StoredMessage } from './history'

const INTERRUPTED_TOOL_OUTPUT =
  'This tool call was interrupted before it produced a result.'

/**
 * Everything the model sees, rebuilt from what was stored. The database keeps
 * a session's whole history; this decides how much of it is replayed and in
 * what shape.
 */
export function toModelMessages(stored: StoredMessage[]): ModelMessage[] {
  const { summary, tail } = afterCompaction(stored)

  const messages: ModelMessage[] = summary
    ? [{ role: 'user', content: summaryPrompt(summary) }]
    : []

  for (const entry of tail) {
    messages.push(
      ...(entry.message.role === 'user'
        ? projectUser(entry)
        : projectAssistant(entry)),
    )
  }

  return messages
}

/**
 * The turns to replay, and the summary standing in for the ones before them.
 * The newest marker wins: a session compacted twice replays only the second
 * summary, since the first is already folded into it.
 */
function afterCompaction(stored: StoredMessage[]): {
  summary: CompactionPart | null
  tail: StoredMessage[]
} {
  for (let index = stored.length - 1; index >= 0; index--) {
    const marker = stored[index].parts.find(isCompaction)
    if (!marker) continue

    const named = marker.tail_start_message_id
    const tailStart =
      named === undefined
        ? index + 1
        : stored.findIndex((entry) => entry.message.id === named)

    return {
      summary: marker,
      // A named tail that is no longer in the session (reverted, deleted)
      // falls back to "everything after the marker" rather than replaying the
      // compacted turns a second time.
      tail: stored.slice(tailStart === -1 ? index + 1 : tailStart),
    }
  }

  return { summary: null, tail: stored }
}

function isCompaction(part: Part): part is CompactionPart {
  return part.type === 'compaction'
}

function summaryPrompt(marker: CompactionPart): string {
  return [
    'The earlier turns of this session were summarised to stay within the context window.',
    'Continue from this summary as though you had the full history.',
    '',
    marker.summary,
  ].join('\n')
}

function projectUser(entry: StoredMessage): ModelMessage[] {
  const content: UserContent = []

  for (const part of entry.parts) {
    if (part.type === 'text' && part.text) {
      content.push({ type: 'text', text: part.text })
      continue
    }
    if (part.type === 'file') {
      content.push(
        part.mime.startsWith('image/')
          ? { type: 'image', image: part.url, mediaType: part.mime }
          : {
              type: 'file',
              data: part.url,
              mediaType: part.mime,
              ...(part.filename ? { filename: part.filename } : {}),
            },
      )
    }
  }

  return content.length > 0 ? [{ role: 'user', content }] : []
}

/**
 * One stored assistant message can hold several rounds of "say something, call
 * a tool, read the result, say something else". Providers require each batch
 * of results to follow the assistant turn that asked for them, so the parts
 * are split back into that alternation instead of being flattened into one
 * assistant message with every call in it.
 */
function projectAssistant(entry: StoredMessage): ModelMessage[] {
  const messages: ModelMessage[] = []
  let content: AssistantContent = []
  let results: ToolResultPart[] = []

  const flush = () => {
    if (content.length > 0) messages.push({ role: 'assistant', content })
    if (results.length > 0) messages.push({ role: 'tool', content: results })
    content = []
    results = []
  }

  for (const part of entry.parts) {
    if (part.type === 'text') {
      if (!part.text) continue
      // Text after a tool result opens the next assistant turn.
      if (results.length > 0) flush()
      content.push({ type: 'text', text: part.text })
      continue
    }

    if (part.type !== 'tool') continue

    content.push({
      type: 'tool-call',
      toolCallId: part.call_id,
      toolName: part.tool,
      input: part.state.input,
    })
    results.push({
      type: 'tool-result',
      toolCallId: part.call_id,
      toolName: part.tool,
      output: { type: 'text', value: toolOutput(part.state) },
    })
  }

  flush()
  return messages
}

/**
 * A call left pending or running was cut short - the process died, the user
 * aborted. It still needs a result, because a call without one is a protocol
 * error for every provider.
 */
function toolOutput(state: Extract<Part, { type: 'tool' }>['state']): string {
  switch (state.state) {
    case 'completed':
      return state.output
    case 'error':
      return state.error
    default:
      return INTERRUPTED_TOOL_OUTPUT
  }
}

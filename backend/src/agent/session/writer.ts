import type {
  AssistantMessage,
  CompactionPart,
  FilePart,
  TextPart,
  ToolPart,
  UserMessage,
} from '../../session/messageSchema'
import { upsertPart } from '../../utils/dbUtils/messageParts'
import { upsertMessage } from '../../utils/dbUtils/messages'
import { generateIdWithPrefix } from '../../utils/generateId'
import type { ModelRef } from '../model'
import type { PermissionScope } from '../permissions'

export type FileAttachment = {
  mime: string
  url: string
  filename?: string
}

/**
 * How a tool call got past the permission layer, kept on the part so the
 * decision outlives the process. The grant stores cannot answer this later:
 * `once` warrants live in memory and session rules die with the backend, so
 * without a record here there is no way to tell afterwards whether a call was
 * allowed by a standing rule or approved by the user at the time.
 */
export type PermissionRecord = {
  outcome:
    | 'allowed-by-rules'
    | 'denied-by-rules'
    | 'granted-by-user'
    | 'refused-by-user'
  /** The scope chosen, when the user was the one who decided. */
  scope?: PermissionScope
  /** The path or command the question was about, as the user saw it. */
  subject?: string
  at: string
}

/**
 * The only thing in the agent that writes messages and parts. Every method
 * persists before it returns, so a run that dies mid-turn leaves a history
 * that still projects: the assistant message is simply missing its completed
 * time, and any tool part still says `running`.
 */
export type SessionWriter = {
  userMessage(text: string, files?: FileAttachment[]): UserMessage
  startAssistantMessage(): AssistantMessage
  completeAssistantMessage(message: AssistantMessage): AssistantMessage
  startTextPart(messageId: string): TextPart
  completeTextPart(part: TextPart, text: string): TextPart
  startToolPart(input: StartToolPartInput): ToolPart
  notePermission(part: ToolPart, permission: PermissionRecord): ToolPart
  completeToolPart(part: ToolPart, output: string): ToolPart
  failToolPart(part: ToolPart, error: string): ToolPart
  compactionPart(input: CompactionPartInput): CompactionPart
}

export type StartToolPartInput = {
  messageId: string
  callId: string
  tool: string
  input: Record<string, unknown>
}

export type CompactionPartInput = {
  messageId: string
  summary: string
  auto: boolean
  tailStartMessageId?: string
}

export function createSessionWriter(
  sessionId: string,
  model: ModelRef,
): SessionWriter {
  const stamp = () => ({
    model_id: model.modelId,
    provider_id: model.providerId,
  })

  const partBase = (messageId: string) => ({
    id: generateIdWithPrefix('part'),
    message_id: messageId,
    session_id: sessionId,
  })

  return {
    userMessage(text, files = []) {
      const message = upsertMessage({
        id: generateIdWithPrefix('message'),
        session_id: sessionId,
        role: 'user',
        model: stamp(),
        time: { created: new Date().toISOString() },
      }) as UserMessage

      upsertPart({ ...partBase(message.id), type: 'text', text })
      for (const file of files) {
        upsertPart({
          ...partBase(message.id),
          type: 'file',
          mime: file.mime,
          url: file.url,
          ...(file.filename ? { filename: file.filename } : {}),
        } satisfies FilePart)
      }

      return message
    },

    startAssistantMessage() {
      return upsertMessage({
        id: generateIdWithPrefix('message'),
        session_id: sessionId,
        role: 'assistant',
        model: stamp(),
        time: { created: new Date().toISOString() },
      }) as AssistantMessage
    },

    completeAssistantMessage(message) {
      return upsertMessage({
        ...message,
        time: { ...message.time, completed: new Date().toISOString() },
      }) as AssistantMessage
    },

    startTextPart(messageId) {
      return upsertPart({
        ...partBase(messageId),
        type: 'text',
        text: '',
      }) as TextPart
    },

    completeTextPart(part, text) {
      return upsertPart({ ...part, text }) as TextPart
    },

    startToolPart({ messageId, callId, tool, input }) {
      return upsertPart({
        ...partBase(messageId),
        type: 'tool',
        call_id: callId,
        tool,
        state: {
          state: 'running',
          input,
          time: { started: new Date().toISOString() },
        },
      }) as ToolPart
    },

    notePermission(part, permission) {
      return upsertPart({
        ...part,
        metadata: { ...part.metadata, permission },
      }) as ToolPart
    },

    completeToolPart(part, output) {
      return upsertPart({
        ...part,
        state: {
          state: 'completed',
          input: part.state.input,
          output,
          time: {
            started: startedAt(part),
            completed: new Date().toISOString(),
          },
        },
      }) as ToolPart
    },

    failToolPart(part, error) {
      return upsertPart({
        ...part,
        state: {
          state: 'error',
          input: part.state.input,
          error,
          time: {
            started: startedAt(part),
            completed: new Date().toISOString(),
          },
        },
      }) as ToolPart
    },

    compactionPart({ messageId, summary, auto, tailStartMessageId }) {
      return upsertPart({
        ...partBase(messageId),
        type: 'compaction',
        summary,
        auto,
        ...(tailStartMessageId
          ? { tail_start_message_id: tailStartMessageId }
          : {}),
      }) as CompactionPart
    },
  }
}

function startedAt(part: ToolPart): string {
  return 'time' in part.state
    ? part.state.time.started
    : new Date().toISOString()
}

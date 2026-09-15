import type {
  AssistantMessage,
  CompactionPart,
  FilePart,
  ReasoningPart,
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

/**
 * The only thing in the agent that writes messages and parts. Every method
 * persists before it returns, so a run that dies mid-turn leaves a history
 * that still projects: the assistant message is simply missing its completed
 * time, and any tool part still says `running`.
 *
 * One instance per turn, holding the session and the model that every row it
 * writes is stamped with.
 */
export class SessionWriter {
  constructor(
    private readonly sessionId: string,
    private readonly model: ModelRef,
  ) {}

  userMessage(text: string, files: FileAttachment[] = []): UserMessage {
    const message = upsertMessage({
      id: generateIdWithPrefix('message'),
      session_id: this.sessionId,
      role: 'user',
      model: this.stamp(),
      time: { created: new Date().toISOString() },
    }) as UserMessage

    upsertPart({ ...this.partBase(message.id), type: 'text', text })
    for (const file of files) {
      upsertPart({
        ...this.partBase(message.id),
        type: 'file',
        mime: file.mime,
        url: file.url,
        ...(file.filename ? { filename: file.filename } : {}),
      } satisfies FilePart)
    }

    return message
  }

  startAssistantMessage(): AssistantMessage {
    return upsertMessage({
      id: generateIdWithPrefix('message'),
      session_id: this.sessionId,
      role: 'assistant',
      model: this.stamp(),
      time: { created: new Date().toISOString() },
    }) as AssistantMessage
  }

  completeAssistantMessage(message: AssistantMessage): AssistantMessage {
    return upsertMessage({
      ...message,
      time: { ...message.time, completed: new Date().toISOString() },
    }) as AssistantMessage
  }

  startTextPart(messageId: string): TextPart {
    return upsertPart({
      ...this.partBase(messageId),
      type: 'text',
      text: '',
    }) as TextPart
  }

  completeTextPart(part: TextPart, text: string): TextPart {
    return upsertPart({ ...part, text }) as TextPart
  }

  startReasoningPart(messageId: string): ReasoningPart {
    return upsertPart({
      ...this.partBase(messageId),
      type: 'reasoning',
      text: '',
    }) as ReasoningPart
  }

  completeReasoningPart(part: ReasoningPart, text: string): ReasoningPart {
    return upsertPart({ ...part, text }) as ReasoningPart
  }

  startToolPart({
    messageId,
    callId,
    tool,
    input,
  }: StartToolPartInput): ToolPart {
    return upsertPart({
      ...this.partBase(messageId),
      type: 'tool',
      call_id: callId,
      tool,
      state: {
        state: 'running',
        input,
        time: { started: new Date().toISOString() },
      },
    }) as ToolPart
  }

  notePermission(part: ToolPart, permission: PermissionRecord): ToolPart {
    return upsertPart({
      ...part,
      metadata: { ...part.metadata, permission },
    }) as ToolPart
  }

  completeToolPart(part: ToolPart, output: string): ToolPart {
    return upsertPart({
      ...part,
      state: {
        state: 'completed',
        input: part.state.input,
        output,
        time: {
          started: SessionWriter.startedAt(part),
          completed: new Date().toISOString(),
        },
      },
    }) as ToolPart
  }

  failToolPart(part: ToolPart, error: string): ToolPart {
    return upsertPart({
      ...part,
      state: {
        state: 'error',
        input: part.state.input,
        error,
        time: {
          started: SessionWriter.startedAt(part),
          completed: new Date().toISOString(),
        },
      },
    }) as ToolPart
  }

  compactionPart({
    messageId,
    summary,
    auto,
    tailStartMessageId,
  }: CompactionPartInput): CompactionPart {
    return upsertPart({
      ...this.partBase(messageId),
      type: 'compaction',
      summary,
      auto,
      ...(tailStartMessageId
        ? { tail_start_message_id: tailStartMessageId }
        : {}),
    }) as CompactionPart
  }

  private stamp() {
    return {
      model_id: this.model.modelId,
      provider_id: this.model.providerId,
    }
  }

  private partBase(messageId: string) {
    return {
      id: generateIdWithPrefix('part'),
      message_id: messageId,
      session_id: this.sessionId,
    }
  }

  private static startedAt(part: ToolPart): string {
    return 'time' in part.state
      ? part.state.time.started
      : new Date().toISOString()
  }
}

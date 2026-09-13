import type {
  FinishReason,
  LanguageModelUsage,
  ModelMessage,
  TextStreamPart,
  ToolResultPart,
  ToolSet,
} from 'ai'
import { streamText } from 'ai'

import type { Project } from '../project/schema'
import type {
  AssistantMessage,
  TextPart,
  ToolPart,
} from '../session/messageSchema'
import type { Session } from '../session/schema'
import { logger } from '../utils/logger'
import type { AgentCallbacks, AgentEvent, AgentUsage } from './events'
import type { ModelRef } from './model'
import { resolveModel } from './model'
import { applyGrant, createRunPermissions } from './permissions'
import type { RunPermissions } from './permissions'
import { buildSystemPrompt } from './prompt/system'
import { loadSessionMessages } from './session/history'
import { toModelMessages } from './session/projector'
import { createSessionWriter } from './session/writer'
import type {
  FileAttachment,
  PermissionRecord,
  SessionWriter,
} from './session/writer'
import { createTools } from './tools'
import { toolFailed } from './tools/types'

/**
 * A model that keeps calling tools without ever answering is not converging,
 * and every step costs a request. High enough that real work never reaches it.
 */
const DEFAULT_MAX_STEPS = 60

export type AgentRunInput = AgentCallbacks & {
  session: Session
  project: Project
  model: ModelRef
  prompt: string
  files?: FileAttachment[]
  abortSignal?: AbortSignal
  maxSteps?: number
}

export type AgentRunResult = {
  message: AssistantMessage
  steps: number
  finishReason: FinishReason
  usage: AgentUsage
  aborted: boolean
}

/**
 * One turn of the conversation, driven by hand rather than by `stopWhen`: the
 * model is handed tool definitions with no `execute`, so it stops at every
 * batch of tool calls and gives control back here. That is what lets the
 * permission layer weigh each call, and the database record each result,
 * in between the model's own steps.
 */
export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS
  const emit = (event: AgentEvent) => input.onEvent?.(event)

  const resolved = await resolveModel(input.model)
  const permissions = createRunPermissions({
    projectId: input.project.id,
    projectDirectory: input.project.directory,
    sessionId: input.session.id,
  })
  const tools = createTools(permissions)
  const definitions = withoutExecute(tools)
  const writer = createSessionWriter(input.session.id, input.model)
  const repetition = createRepetitionGuard()
  const system = buildSystemPrompt(input.project)

  writer.userMessage(input.prompt, input.files)

  // Read back from storage rather than appended in memory: the projection is
  // the single place that decides what the model sees, so a compacted session
  // and a fresh one take the same path.
  const messages = toModelMessages(loadSessionMessages(input.session.id))

  const assistant = writer.startAssistantMessage()
  emit({ type: 'assistant-start', message: assistant })

  let steps = 0
  let finishReason: FinishReason = 'other'
  let usage: AgentUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  let aborted = false

  try {
    while (steps < maxSteps) {
      steps++

      const result = streamText({
        model: resolved.model,
        system,
        messages,
        tools: definitions,
        abortSignal: input.abortSignal,
        // The same failure also reaches the stream, which is where it is dealt
        // with. Without a handler here the SDK leaves it as an unhandled
        // rejection too, and the runtime dumps the whole thing to stderr.
        onError: () => {},
      })

      const step = await consumeStream({
        stream: result.stream,
        messageId: assistant.id,
        writer,
        emit,
      })

      messages.push(...(await result.responseMessages))
      finishReason = await result.finishReason
      usage = addUsage(usage, await result.usage)
      emit({ type: 'step-end', finishReason, usage })

      if (finishReason !== 'tool-calls' || step.calls.length === 0) break

      const results: ToolResultPart[] = []
      for (const call of step.calls) {
        results.push(
          await settleToolCall({
            call,
            tools,
            permissions,
            repetition,
            writer,
            emit,
            messages,
            projectId: input.project.id,
            sessionId: input.session.id,
            abortSignal: input.abortSignal,
            onPermissionRequest: input.onPermissionRequest,
          }),
        )
      }
      messages.push({ role: 'tool', content: results })
    }
  } catch (error) {
    if (!isAbort(error, input.abortSignal)) throw error
    aborted = true
    finishReason = 'stop'
  }

  const completed = writer.completeAssistantMessage(assistant)
  emit({ type: 'assistant-end', message: completed })

  return { message: completed, steps, finishReason, usage, aborted }
}

/**
 * The same tools the agent runs, minus the thing that runs them. `streamText`
 * auto-executes any tool that still has an `execute`, which would take the
 * decision away from this loop.
 */
function withoutExecute(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const { execute: _execute, ...rest } = definition
      return [name, rest]
    }),
  )
}

type PendingCall = {
  toolCallId: string
  toolName: string
  input: unknown
  part: ToolPart
}

type ConsumeStreamInput = {
  stream: AsyncIterable<TextStreamPart<ToolSet>>
  messageId: string
  writer: SessionWriter
  emit: (event: AgentEvent) => void
}

/**
 * Turns one step's stream into stored parts. A text part is opened when the
 * model starts speaking and closed when it stops, so the order parts come back
 * in matches the order they were produced - which is what the projector relies
 * on to rebuild the assistant/tool alternation.
 */
async function consumeStream({
  stream,
  messageId,
  writer,
  emit,
}: ConsumeStreamInput): Promise<{ calls: PendingCall[] }> {
  const open = new Map<string, { part: TextPart; text: string }>()
  const calls: PendingCall[] = []

  const close = (streamId: string) => {
    const entry = open.get(streamId)
    if (!entry) return
    open.delete(streamId)
    writer.completeTextPart(entry.part, entry.text)
    emit({ type: 'text-end', partId: entry.part.id, text: entry.text })
  }

  try {
    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'text-start': {
          const part = writer.startTextPart(messageId)
          open.set(chunk.id, { part, text: '' })
          emit({ type: 'text-start', partId: part.id })
          break
        }
        case 'text-delta': {
          const entry = open.get(chunk.id)
          if (!entry) break
          entry.text += chunk.text
          emit({ type: 'text-delta', partId: entry.part.id, text: chunk.text })
          break
        }
        case 'text-end':
          close(chunk.id)
          break
        case 'reasoning-delta':
          emit({ type: 'reasoning-delta', text: chunk.text })
          break
        case 'tool-call': {
          const part = writer.startToolPart({
            messageId,
            callId: chunk.toolCallId,
            tool: chunk.toolName,
            input: (chunk.input ?? {}) as Record<string, unknown>,
          })
          calls.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input,
            part,
          })
          emit({ type: 'tool-start', part })
          break
        }
        case 'error':
          throw chunk.error
      }
    }
  } finally {
    // An aborted stream never sends `text-end`; the text said so far is still
    // worth keeping, and an empty part would otherwise sit in the history.
    for (const streamId of [...open.keys()]) close(streamId)
  }

  return { calls }
}

type SettleToolCallInput = {
  call: PendingCall
  tools: ToolSet
  permissions: RunPermissions
  repetition: RepetitionGuard
  writer: SessionWriter
  emit: (event: AgentEvent) => void
  messages: ModelMessage[]
  projectId: string
  sessionId: string
  abortSignal: AbortSignal | undefined
  onPermissionRequest: AgentCallbacks['onPermissionRequest']
}

/**
 * Weigh one call, run it if it is allowed, and produce the result the model
 * will read. A refusal is a result like any other: the model is told it was
 * refused and carries on, because ending the turn there would leave a tool
 * call without the result every provider requires.
 */
async function settleToolCall({
  call,
  tools,
  permissions,
  repetition,
  writer,
  emit,
  messages,
  projectId,
  sessionId,
  abortSignal,
  onPermissionRequest,
}: SettleToolCallInput): Promise<ToolResultPart> {
  const looping = repetition.refusalFor(call)
  if (looping !== null) {
    const part = writer.failToolPart(call.part, looping)
    emit({ type: 'tool-end', part })
    return toolResult(call, looping)
  }

  const approval = await approve({
    call,
    permissions,
    projectId,
    sessionId,
    onPermissionRequest,
  })
  const noted = writer.notePermission(call.part, approval.record)

  if (!approval.allowed) {
    const part = writer.failToolPart(noted, approval.refusal)
    emit({ type: 'tool-denied', part, reason: approval.refusal })
    return toolResult(call, approval.refusal)
  }

  const execute = tools[call.toolName]?.execute
  if (!execute) {
    const message = `Error: "${call.toolName}" is not a tool this agent has.`
    emit({ type: 'tool-end', part: writer.failToolPart(noted, message) })
    return toolResult(call, message)
  }

  try {
    const output: unknown = await execute(call.input, {
      toolCallId: call.toolCallId,
      messages,
      abortSignal,
      context: undefined,
    })
    const text = typeof output === 'string' ? output : JSON.stringify(output)
    const part = toolFailed(text)
      ? writer.failToolPart(noted, text)
      : writer.completeToolPart(noted, text)
    emit({ type: 'tool-end', part })
    return toolResult(call, text)
  } catch (error) {
    if (isAbort(error, abortSignal)) throw error
    logger.error({ error, tool: call.toolName }, 'tool execution failed')
    const message = `Error: ${error instanceof Error ? error.message : String(error)}`
    emit({ type: 'tool-end', part: writer.failToolPart(noted, message) })
    return toolResult(call, message)
  }
}

type Approval =
  | { allowed: true; record: PermissionRecord }
  | { allowed: false; record: PermissionRecord; refusal: string }

/**
 * Whether the call may run, along with the record of how that was settled.
 * The two travel together because only one of them can be reconstructed
 * afterwards, and it is not the record.
 */
async function approve({
  call,
  permissions,
  projectId,
  sessionId,
  onPermissionRequest,
}: Pick<
  SettleToolCallInput,
  'call' | 'permissions' | 'projectId' | 'sessionId' | 'onPermissionRequest'
>): Promise<Approval> {
  const verdict = await permissions.checkToolCall({
    toolName: call.toolName,
    toolCallId: call.toolCallId,
    input: call.input,
  })

  const at = new Date().toISOString()

  if (verdict.decision === 'allow') {
    return { allowed: true, record: { outcome: 'allowed-by-rules', at } }
  }
  if (verdict.decision === 'deny') {
    return {
      allowed: false,
      record: { outcome: 'denied-by-rules', at },
      refusal: `Error: ${verdict.reason}`,
    }
  }

  const subject = verdict.request.subject
  const scope = await onPermissionRequest(verdict.request, call.toolCallId)

  if (scope === null) {
    return {
      allowed: false,
      record: { outcome: 'refused-by-user', subject, at },
      refusal:
        'Error: the user did not approve this. Do not attempt it again by another route.',
    }
  }

  applyGrant({
    scope,
    sessionId,
    projectId,
    toolCallId: call.toolCallId,
    request: verdict.request,
  })
  return {
    allowed: true,
    record: { outcome: 'granted-by-user', scope, subject, at },
  }
}

export type RepetitionGuard = {
  /** What to tell the model instead of running, or `null` to go ahead. */
  refusalFor(call: PendingCall): string | null
}

/**
 * Stops the model retrying a call that has already failed the same way twice.
 *
 * Only a run of identical calls counts, never a total: reading the same file
 * again after editing it is ordinary work, whereas sending byte-for-byte the
 * same arguments a third time in a row cannot produce a different answer. One
 * session spent three of its five wasted `edit` calls exactly this way.
 */
export function createRepetitionGuard(limit = 3): RepetitionGuard {
  let signature = ''
  let seen = 0

  return {
    refusalFor(call) {
      const next = `${call.toolName}:${JSON.stringify(call.input)}`
      if (next !== signature) {
        signature = next
        seen = 1
        return null
      }

      seen += 1
      if (seen < limit) return null

      return `Error: this is call ${seen} to \`${call.toolName}\` with byte-for-byte the same arguments, and it was not run. The result will not change. Do not send it again - either establish what is actually wrong (read the file to see its current state, or check the tool's description for the format it expects) or tell the user what is blocking you.`
    },
  }
}

function toolResult(call: PendingCall, text: string): ToolResultPart {
  return {
    type: 'tool-result',
    toolCallId: call.toolCallId,
    toolName: call.toolName,
    output: { type: 'text', value: text },
  }
}

function addUsage(left: AgentUsage, right: LanguageModelUsage): AgentUsage {
  return {
    inputTokens: left.inputTokens + (right.inputTokens ?? 0),
    outputTokens: left.outputTokens + (right.outputTokens ?? 0),
    totalTokens: left.totalTokens + (right.totalTokens ?? 0),
  }
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError'))
  )
}

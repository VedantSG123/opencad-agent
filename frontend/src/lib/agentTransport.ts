import type { ChatTransport, InferUIMessageChunk } from 'ai'
import { parseJsonEventStream, uiMessageChunkSchema } from 'ai'
import type { Attachment } from 'shared/attachments'
import z from 'zod'

import type { SelectedModel } from '@/features/Providers/components/ModelSelectButton'
import type { AgentUIMessage } from '@/types/agent'
import { getBaseApiUrl } from '@/utils/getApiBaseUrl'

export type AgentUIChunk = InferUIMessageChunk<AgentUIMessage>

const promptBodySchema = z.object({
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }) satisfies z.ZodType<SelectedModel>,
})

/**
 * Long enough to ride out a `bun --watch` restart in development. A run does
 * not survive one, so a reconnect that lands afterwards is told the run is
 * gone rather than waiting on it.
 */
const RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 4000]

class MalformedChunkError extends Error {}

/** The run this stream was reading no longer exists on the backend. */
export class RunLostError extends Error {
  constructor() {
    super(
      'Lost the connection to the agent before this turn finished. What it saved is shown.',
    )
  }
}

/**
 * Starts a turn with a POST and reads it from the session's stream, which
 * outlives the request. `chatId` is the session id.
 */
export class AgentTransport implements ChatTransport<AgentUIMessage> {
  async sendMessages({
    chatId,
    messages,
    body,
    abortSignal,
  }: Parameters<ChatTransport<AgentUIMessage>['sendMessages']>[0]) {
    const message = messages.at(-1)
    if (message?.role !== 'user')
      throw new Error('There is no message to send.')

    const { model } = promptBodySchema.parse(body)
    const response = await fetch(`${sessionUrl(chatId)}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: textOf(message),
        model,
        files: filesOf(message),
      }),
      signal: abortSignal,
    })
    if (!response.ok) throw new Error(await errorMessage(response))

    const first = await openStream(chatId, -1, abortSignal)
    if (!first) throw new RunLostError()
    return resumable(chatId, first, abortSignal)
  }

  async reconnectToStream({
    chatId,
  }: Parameters<ChatTransport<AgentUIMessage>['reconnectToStream']>[0]) {
    const first = await openStream(chatId, -1)
    return first ? resumable(chatId, first) : null
  }
}

export function sessionUrl(sessionId: string): string {
  return `${getBaseApiUrl()}/sessions/${sessionId}`
}

/**
 * A stream that survives its connection dropping: it counts the chunks the
 * run buffered, and on a drop asks again for everything after the last one.
 * Heartbeats are `transient` and never buffered, so they are not counted.
 */
function resumable(
  sessionId: string,
  first: ReadableStream<AgentUIChunk>,
  signal?: AbortSignal,
): ReadableStream<AgentUIChunk> {
  let reader = first.getReader()
  let received = 0
  // The chat cancels the stream when it reads an `error` chunk. A read still
  // pending then resolves as done, and the stream is no longer ours to close.
  let cancelled = false

  return new ReadableStream<AgentUIChunk>({
    async pull(controller) {
      for (;;) {
        // Only the read is a connection that can drop. Anything the controller
        // throws is about this stream, and reconnecting cannot change it.
        let result: ReadableStreamReadResult<AgentUIChunk>
        try {
          result = await reader.read()
        } catch (error) {
          if (cancelled) return
          if (signal?.aborted || error instanceof MalformedChunkError) {
            controller.error(error)
            return
          }
          const next = await reconnect(sessionId, received - 1, signal)
          if (cancelled) return
          if (!next) {
            controller.error(new RunLostError())
            return
          }
          reader = next.getReader()
          continue
        }

        if (cancelled) return
        if (result.done) {
          controller.close()
          return
        }
        if (!isTransient(result.value)) received++
        controller.enqueue(result.value)
        return
      }
    },
    cancel(reason) {
      cancelled = true
      return reader.cancel(reason)
    },
  })
}

async function reconnect(
  sessionId: string,
  after: number,
  signal?: AbortSignal,
): Promise<ReadableStream<AgentUIChunk> | null> {
  for (const delay of RECONNECT_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (signal?.aborted) return null
    try {
      return await openStream(sessionId, after, signal)
    } catch {
      // Still down; the next attempt waits longer.
    }
  }
  return null
}

/** `null` when the session has no run to read: the 204 the route answers. */
async function openStream(
  sessionId: string,
  after: number,
  signal?: AbortSignal,
): Promise<ReadableStream<AgentUIChunk> | null> {
  const response = await fetch(
    `${sessionUrl(sessionId)}/stream?after=${after}`,
    { signal },
  )
  if (response.status === 204) return null
  if (!response.ok || !response.body) {
    throw new Error(await errorMessage(response))
  }

  return parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(parsed, controller) {
        if (!parsed.success) throw new MalformedChunkError(parsed.error.message)
        // The schema checks the chunk's shape but types every data payload as
        // `unknown`; ours are the shared types the backend wrote them from.
        controller.enqueue(parsed.value as AgentUIChunk)
      },
    }),
  )
}

function isTransient(chunk: AgentUIChunk): boolean {
  return 'transient' in chunk && chunk.transient === true
}

function textOf(message: AgentUIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

function filesOf(message: AgentUIMessage): Attachment[] {
  return message.parts.flatMap((part) =>
    part.type === 'file'
      ? [
          {
            mime: part.mediaType,
            url: part.url,
            ...(part.filename ? { filename: part.filename } : {}),
          },
        ]
      : [],
  )
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string') return body.message
  } catch {
    // Not JSON; the status line is all there is.
  }
  return `${response.status} ${response.statusText}`
}

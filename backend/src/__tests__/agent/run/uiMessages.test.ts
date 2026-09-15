import { describe, expect, test } from 'bun:test'

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
} from 'ai'
import type { UIMessage, UIMessageChunk } from 'ai'

import type { AgentStreamEvent } from '../../../agent/events'
import { toUIChunks, toUIMessages } from '../../../agent/run/uiMessages'
import type { StoredMessage } from '../../../agent/session/history'
import type { Message, Part, ToolPart } from '../../../session/messageSchema'

const SESSION = 'ses_test'

let counter = 0
const nextId = (prefix: string) => `${prefix}_${++counter}`

function message(id: string, role: 'user' | 'assistant'): Message {
  const model = { model_id: 'test-model', provider_id: 'test' }
  return role === 'user'
    ? { id, session_id: SESSION, role, model, time: { created: 'now' } }
    : {
        id,
        session_id: SESSION,
        role,
        model,
        time: { created: 'now', completed: 'now' },
      }
}

function partBase(messageId: string) {
  return { id: nextId('prt'), message_id: messageId, session_id: SESSION }
}

function toolPart(
  messageId: string,
  tool: string,
  input: Record<string, unknown>,
  outcome: { output: string } | { error: string } | 'running',
): ToolPart {
  const time = { started: 'now', completed: 'now' }
  return {
    ...partBase(messageId),
    type: 'tool',
    call_id: nextId('call'),
    tool,
    state:
      outcome === 'running'
        ? { state: 'running', input, time: { started: 'now' } }
        : 'output' in outcome
          ? { state: 'completed', input, output: outcome.output, time }
          : { state: 'error', input, error: outcome.error, time },
  }
}

function stored(role: 'user' | 'assistant', parts: (id: string) => Part[]) {
  const id = nextId('msg')
  return {
    message: message(id, role),
    parts: parts(id),
  } satisfies StoredMessage
}

describe('toUIMessages', () => {
  test('a text exchange keeps its roles and order', () => {
    const messages = toUIMessages([
      stored('user', (id) => [{ ...partBase(id), type: 'text', text: 'hi' }]),
      stored('assistant', (id) => [
        { ...partBase(id), type: 'text', text: 'hello' },
      ]),
    ])

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[0].parts).toEqual([
      { type: 'text', text: 'hi', state: 'done' },
    ])
  })

  test('a completed tool call becomes an output-available part', () => {
    const messages = toUIMessages([
      stored('assistant', (id) => [
        toolPart(id, 'read', { path: 'main.scad' }, { output: 'contents' }),
      ]),
    ])

    const part = messages[0].parts[0] as Record<string, unknown>
    expect(part.type).toBe('tool-read')
    expect(part.state).toBe('output-available')
    expect(part.input).toEqual({ path: 'main.scad' })
    expect(part.output).toBe('contents')
  })

  test('a failed tool call becomes output-error, not a successful one', () => {
    const messages = toUIMessages([
      stored('assistant', (id) => [
        toolPart(id, 'edit', { path: 'a.scad' }, { error: 'Error: no match' }),
      ]),
    ])

    const part = messages[0].parts[0] as Record<string, unknown>
    expect(part.state).toBe('output-error')
    expect(part.errorText).toBe('Error: no match')
    expect(part.output).toBeUndefined()
  })

  test('a call the process died inside still renders with its input', () => {
    const messages = toUIMessages([
      stored('assistant', (id) => [
        toolPart(id, 'shell', { command: 'bun test' }, 'running'),
      ]),
    ])

    const part = messages[0].parts[0] as Record<string, unknown>
    expect(part.state).toBe('input-available')
    expect(part.input).toEqual({ command: 'bun test' })
  })

  test('compaction markers and empty text are not rendered', () => {
    const messages = toUIMessages([
      stored('assistant', (id) => [
        { ...partBase(id), type: 'text', text: '' },
        { ...partBase(id), type: 'compaction', summary: 'earlier', auto: true },
      ]),
    ])

    expect(messages).toHaveLength(0)
  })
})

describe('toUIChunks', () => {
  const chunks = (events: AgentStreamEvent[]) => events.flatMap(toUIChunks)

  test('text streams through with the part id intact', () => {
    const result = chunks([
      { type: 'text-start', id: 'prt_1' },
      { type: 'text-delta', id: 'prt_1', delta: 'he' },
      { type: 'text-delta', id: 'prt_1', delta: 'llo' },
      { type: 'text-end', id: 'prt_1' },
    ])

    expect(result).toEqual([
      { type: 'text-start', id: 'prt_1' },
      { type: 'text-delta', id: 'prt_1', delta: 'he' },
      { type: 'text-delta', id: 'prt_1', delta: 'llo' },
      { type: 'text-end', id: 'prt_1' },
    ])
  })

  test('reasoning passes through with the id the model gave it', () => {
    const result = chunks([
      { type: 'reasoning-start', id: 'rsn_1' },
      { type: 'reasoning-delta', id: 'rsn_1', delta: 'thinking' },
      { type: 'reasoning-end', id: 'rsn_1' },
    ])

    expect(result).toEqual([
      { type: 'reasoning-start', id: 'rsn_1' },
      { type: 'reasoning-delta', id: 'rsn_1', delta: 'thinking' },
      { type: 'reasoning-end', id: 'rsn_1' },
    ])
  })

  test('tool arguments stream before they parse', () => {
    const result = chunks([
      { type: 'tool-input-start', toolCallId: 'call_1', toolName: 'edit' },
      {
        type: 'tool-input-delta',
        toolCallId: 'call_1',
        inputTextDelta: '{"path":',
      },
    ])

    expect(result).toEqual([
      { type: 'tool-input-start', toolCallId: 'call_1', toolName: 'edit' },
      {
        type: 'tool-input-delta',
        toolCallId: 'call_1',
        inputTextDelta: '{"path":',
      },
    ])
  })

  test('a parsed call carries the input that was stored', () => {
    const part = toolPart('msg_1', 'read', { path: 'main.scad' }, 'running')

    expect(chunks([{ type: 'tool-input-available', part }])).toEqual([
      {
        type: 'tool-input-available',
        toolCallId: part.call_id,
        toolName: 'read',
        input: { path: 'main.scad' },
      },
    ])
  })

  test('a write tool reports the file it changed', () => {
    const part = toolPart(
      'msg_1',
      'edit',
      { path: 'src/bracket.js', diff: 'x' },
      { output: 'Edited src/bracket.js' },
    )

    expect(chunks([{ type: 'tool-output-available', part }])).toEqual([
      {
        type: 'tool-output-available',
        toolCallId: part.call_id,
        output: 'Edited src/bracket.js',
      },
      {
        type: 'data-file-changed',
        data: { path: 'src/bracket.js', tool: 'edit' },
      },
    ])
  })

  test('a read reports no file change', () => {
    const part = toolPart(
      'msg_1',
      'read',
      { path: 'main.scad' },
      {
        output: 'contents',
      },
    )

    expect(
      chunks([{ type: 'tool-output-available', part }]).map((c) => c.type),
    ).toEqual(['tool-output-available'])
  })

  test('a refusal keeps its reason, which output-denied would drop', () => {
    const part = toolPart(
      'msg_1',
      'shell',
      { command: 'rm -rf /' },
      {
        error: 'Error: not permitted',
      },
    )

    expect(
      chunks([
        { type: 'tool-output-error', part, errorText: 'Error: not permitted' },
      ]),
    ).toEqual([
      {
        type: 'tool-output-error',
        toolCallId: part.call_id,
        errorText: 'Error: not permitted',
      },
    ])
  })

  test('the message id travels on start, and finish closes the turn', () => {
    const result = chunks([
      { type: 'start', message: message('msg_1', 'assistant') as never },
      { type: 'start-step' },
      {
        type: 'finish-step',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
      { type: 'finish', message: message('msg_1', 'assistant') as never },
    ])

    expect(result).toEqual([
      { type: 'start', messageId: 'msg_1' },
      { type: 'start-step' },
      { type: 'finish-step' },
      { type: 'finish' },
    ])
  })
})

describe('reasoning in restored history', () => {
  test('a stored reasoning part comes back for the panel to show', () => {
    const messages = toUIMessages([
      stored('assistant', (id) => [
        { ...partBase(id), type: 'reasoning', text: 'weighing the options' },
        { ...partBase(id), type: 'text', text: 'Use a 20mm fillet.' },
      ]),
    ])

    expect(messages[0].parts).toEqual([
      { type: 'reasoning', text: 'weighing the options', state: 'done' },
      { type: 'text', text: 'Use a 20mm fillet.', state: 'done' },
    ])
  })

  test('reasoning left empty by an aborted turn is not rendered', () => {
    const messages = toUIMessages([
      stored('assistant', (id) => [
        { ...partBase(id), type: 'reasoning', text: '' },
      ]),
    ])

    expect(messages).toHaveLength(0)
  })
})

// Not our code, but load-bearing on it: keep-alives are written to the stream
// purely so the connection carries traffic during a quiet turn. If `transient`
// ever stopped meaning "do not keep this", every assistant message in the
// panel would start collecting heartbeats.
describe('keep-alive chunks', () => {
  test('reach the wire but not the message', async () => {
    const chunks: UIMessageChunk[] = [
      { type: 'start', messageId: 'msg_1' },
      { type: 'data-keep-alive', data: 1, transient: true },
      { type: 'text-start', id: 'prt_1' },
      { type: 'text-delta', id: 'prt_1', delta: 'hello' },
      { type: 'text-end', id: 'prt_1' },
      { type: 'data-keep-alive', data: 2, transient: true },
      { type: 'finish' },
    ]

    const build = () =>
      createUIMessageStream({
        execute: ({ writer }) => {
          for (const chunk of chunks) writer.write(chunk)
        },
      })

    const wire = await createUIMessageStreamResponse({
      stream: build(),
    }).text()
    expect(wire).toContain('"type":"data-keep-alive"')

    let assembled: UIMessage | undefined
    for await (const message of readUIMessageStream({ stream: build() })) {
      assembled = message
    }

    expect(assembled?.parts.map((part) => part.type)).toEqual(['text'])
  })
})

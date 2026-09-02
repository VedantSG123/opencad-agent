import { describe, expect, test } from 'bun:test'

import type { StoredMessage } from '../../../agent/session/history'
import { toModelMessages } from '../../../agent/session/projector'
import type { Message, Part } from '../../../session/messageSchema'

const SESSION = 'ses_test'

let counter = 0
const nextId = (prefix: string) =>
  `${prefix}_${String(++counter).padStart(4, '0')}`

function user(text: string): StoredMessage {
  const id = nextId('msg')
  return {
    message: message(id, 'user'),
    parts: [{ ...partBase(id), type: 'text', text }],
  }
}

function assistant(parts: (id: string) => Part[]): StoredMessage {
  const id = nextId('msg')
  return { message: message(id, 'assistant'), parts: parts(id) }
}

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

function text(messageId: string, value: string): Part {
  return { ...partBase(messageId), type: 'text', text: value }
}

function toolCall(
  messageId: string,
  callId: string,
  output: string | null,
): Part {
  return {
    ...partBase(messageId),
    type: 'tool',
    call_id: callId,
    tool: 'read',
    state:
      output === null
        ? {
            state: 'running',
            input: { path: 'a.scad' },
            time: { started: 'now' },
          }
        : {
            state: 'completed',
            input: { path: 'a.scad' },
            output,
            time: { started: 'now', completed: 'now' },
          },
  }
}

describe('toModelMessages', () => {
  test('a plain exchange keeps its order', () => {
    const messages = toModelMessages([
      user('make a cube'),
      assistant((id) => [text(id, 'Done.')]),
    ])

    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'make a cube' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    ])
  })

  test('a tool call becomes an assistant turn followed by its results', () => {
    const messages = toModelMessages([
      user('read the file'),
      assistant((id) => [
        text(id, 'Reading it.'),
        toolCall(id, 'call_1', 'contents'),
      ]),
    ])

    expect(messages.map((entry) => entry.role)).toEqual([
      'user',
      'assistant',
      'tool',
    ])
    expect(messages[2]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'read',
          output: { type: 'text', value: 'contents' },
        },
      ],
    })
  })

  test('text after a result opens a new assistant turn', () => {
    const messages = toModelMessages([
      user('read both files'),
      assistant((id) => [
        text(id, 'First one.'),
        toolCall(id, 'call_1', 'a'),
        text(id, 'Now the second.'),
        toolCall(id, 'call_2', 'b'),
        text(id, 'Both read.'),
      ]),
    ])

    // Providers require each batch of results to follow the assistant turn
    // that asked for them, never to be bundled with a later one.
    expect(messages.map((entry) => entry.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
    ])
  })

  test('a call that never finished still gets a result', () => {
    const messages = toModelMessages([
      user('read it'),
      assistant((id) => [toolCall(id, 'call_1', null)]),
    ])

    const results = messages[messages.length - 1]
    expect(results.role).toBe('tool')
    expect(JSON.stringify(results)).toContain('interrupted')
  })

  test('empty text parts are dropped rather than sent as blank turns', () => {
    const messages = toModelMessages([
      user('hi'),
      assistant((id) => [text(id, '')]),
    ])

    expect(messages).toHaveLength(1)
  })

  test('a compaction marker replaces everything before it', () => {
    const before = user('the first thing I asked')
    const marker = assistant((id) => [
      {
        ...partBase(id),
        type: 'compaction',
        summary: 'The user wants a bracket.',
        auto: true,
      },
    ])
    const after = user('now add a fillet')

    const messages = toModelMessages([before, marker, after])

    expect(messages).toHaveLength(2)
    expect(JSON.stringify(messages[0])).toContain('The user wants a bracket.')
    expect(JSON.stringify(messages)).not.toContain('the first thing I asked')
    expect(JSON.stringify(messages[1])).toContain('now add a fillet')
  })

  test('the newest marker wins when a session was compacted twice', () => {
    const first = assistant((id) => [
      { ...partBase(id), type: 'compaction', summary: 'older', auto: true },
    ])
    const second = assistant((id) => [
      { ...partBase(id), type: 'compaction', summary: 'newer', auto: true },
    ])

    const messages = toModelMessages([first, user('middle'), second])

    expect(messages).toHaveLength(1)
    expect(JSON.stringify(messages[0])).toContain('newer')
    expect(JSON.stringify(messages[0])).not.toContain('older')
  })

  test('a tail that names a message replays from there', () => {
    const kept = user('keep me')
    const marker = assistant((id) => [
      {
        ...partBase(id),
        type: 'compaction',
        summary: 'summary',
        auto: false,
        tail_start_message_id: kept.message.id,
      },
    ])

    const messages = toModelMessages([user('dropped'), kept, marker])

    expect(JSON.stringify(messages)).toContain('keep me')
    expect(JSON.stringify(messages)).not.toContain('dropped')
  })

  test('a tail naming a message that is gone falls back to the marker', () => {
    const marker = assistant((id) => [
      {
        ...partBase(id),
        type: 'compaction',
        summary: 'summary',
        auto: false,
        tail_start_message_id: 'msg_reverted',
      },
    ])

    const messages = toModelMessages([user('dropped'), marker, user('kept')])

    expect(JSON.stringify(messages)).toContain('kept')
    expect(JSON.stringify(messages)).not.toContain('dropped')
  })
})

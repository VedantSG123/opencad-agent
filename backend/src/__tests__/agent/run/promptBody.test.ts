import { describe, expect, test } from 'bun:test'

import {
  MAX_PROMPT_BODY_BYTES,
  PromptBodyTooLargeError,
  readPromptBody,
} from '../../../utils/sessions/promptBody'

const CHUNK = 64 * 1024

/** A body streamed in chunks, recording how many the reader pulled. */
function streamed(totalBytes: number) {
  let pulled = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const sent = pulled * CHUNK
      if (sent >= totalBytes) return controller.close()
      pulled++
      controller.enqueue(new Uint8Array(Math.min(CHUNK, totalBytes - sent)))
    },
  })
  const request = new Request('http://localhost/', { method: 'POST', body })
  return { request, pulled: () => pulled }
}

describe('readPromptBody', () => {
  test('a body inside the limit is parsed as JSON', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'hi' }),
    })
    expect(await readPromptBody(request)).toEqual({ prompt: 'hi' })
  })

  test('a body past the limit is refused before the rest is read', async () => {
    const { request, pulled } = streamed(MAX_PROMPT_BODY_BYTES * 4)

    const error = await readPromptBody(request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PromptBodyTooLargeError)
    expect(pulled() * CHUNK).toBeLessThan(MAX_PROMPT_BODY_BYTES * 2)
  })
})

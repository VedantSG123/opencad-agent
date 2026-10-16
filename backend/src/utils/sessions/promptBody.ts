import { base64Length, MAX_ATTACHMENTS_TOTAL_BYTES } from 'shared/attachments'

/**
 * The attachments at their base64 size, plus a megabyte for the prompt text,
 * the data URI headers and the JSON around them. The route still checks the
 * decoded sizes and answers with a reason; this stops a body far past them
 * being read at all.
 */
export const MAX_PROMPT_BODY_BYTES =
  base64Length(MAX_ATTACHMENTS_TOTAL_BYTES) + 1024 * 1024

export class PromptBodyTooLargeError extends Error {}

export async function readPromptBody(request: Request): Promise<unknown> {
  if (!request.body) return undefined

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    received += value.byteLength
    if (received > MAX_PROMPT_BODY_BYTES) {
      await reader.cancel()
      throw new PromptBodyTooLargeError(
        'This message and its attachments are too large to send.',
      )
    }
    chunks.push(value)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

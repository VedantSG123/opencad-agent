import type { Message, Part } from '../../session/messageSchema'
import { getPartsBySessionId } from '../../utils/dbUtils/messageParts'
import { getMessagesBySessionId } from '../../utils/dbUtils/messages'

/** A stored message together with the parts that belong to it, in order. */
export type StoredMessage = {
  message: Message
  parts: Part[]
}

/**
 * Two queries rather than one per message: a long session is hundreds of
 * messages, and both tables already come back ordered by id.
 */
export function loadSessionMessages(sessionId: string): StoredMessage[] {
  const partsByMessage = new Map<string, Part[]>()
  for (const part of getPartsBySessionId(sessionId)) {
    const existing = partsByMessage.get(part.message_id)
    if (existing) {
      existing.push(part)
      continue
    }
    partsByMessage.set(part.message_id, [part])
  }

  return getMessagesBySessionId(sessionId).map((message) => ({
    message,
    parts: partsByMessage.get(message.id) ?? [],
  }))
}

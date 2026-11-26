import { createContext, useContext, useEffect, useRef } from 'react'
import type { Reference } from 'shared/references'

type Mention = (reference: Reference) => void

interface ChatMentionValue {
  mention: Mention
  register: (target: Mention) => () => void
}

const ChatMentionContext = createContext<ChatMentionValue | null>(null)

/**
 * Carries a reference from wherever it was picked to the composer on screen,
 * which places it at the caret. Only one composer is mounted at a time.
 */
export function ChatMentionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const target = useRef<Mention | null>(null)

  return (
    <ChatMentionContext.Provider
      value={{
        mention: (reference) => target.current?.(reference),
        register: (next) => {
          target.current = next
          return () => {
            if (target.current === next) target.current = null
          }
        },
      }}
    >
      {children}
    </ChatMentionContext.Provider>
  )
}

export function useChatMention() {
  const ctx = useContext(ChatMentionContext)
  if (!ctx) {
    throw new Error('useChatMention must be used within ChatMentionProvider')
  }
  return ctx
}

export function useMentionTarget(target: Mention) {
  const { register } = useChatMention()
  useEffect(() => register(target), [register, target])
}

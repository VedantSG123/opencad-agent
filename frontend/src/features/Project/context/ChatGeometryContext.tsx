import { createContext, useContext, useState } from 'react'
import type { GeometryRef } from 'shared/geometry'
import { geometryRefText } from 'shared/geometry'

interface ChatGeometryValue {
  geometry: GeometryRef[]
  isAttached: (ref: GeometryRef) => boolean
  attach: (ref: GeometryRef) => void
  detach: (index: number) => void
  clear: () => void
}

const ChatGeometryContext = createContext<ChatGeometryValue | null>(null)

export function ChatGeometryProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [geometry, setGeometry] = useState<GeometryRef[]>([])

  // Two references the agent would read identically are one attachment.
  function isAttached(ref: GeometryRef) {
    const text = geometryRefText(ref)
    return geometry.some((held) => geometryRefText(held) === text)
  }

  return (
    <ChatGeometryContext.Provider
      value={{
        geometry,
        isAttached,
        attach: (ref) => {
          if (!isAttached(ref)) setGeometry((current) => [...current, ref])
        },
        detach: (index) =>
          setGeometry((current) => current.filter((_, i) => i !== index)),
        clear: () => setGeometry([]),
      }}
    >
      {children}
    </ChatGeometryContext.Provider>
  )
}

export function useChatGeometry() {
  const ctx = useContext(ChatGeometryContext)
  if (!ctx) {
    throw new Error('useChatGeometry must be used within ChatGeometryProvider')
  }
  return ctx
}

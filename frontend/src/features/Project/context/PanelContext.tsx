import { createContext, useContext, useRef, useState } from 'react'

import type { PanelImperativeHandle } from '@/components/ui/resizable'

type FocusedPanel = 'editor' | 'viewport'

interface PanelContextValue {
  isCodeEditorCollapsed: boolean
  isAgentCollapsed: boolean
  codeEditorRef: React.RefObject<PanelImperativeHandle | null>
  agentRef: React.RefObject<PanelImperativeHandle | null>
  setIsCodeEditorCollapsed: (v: boolean) => void
  setIsAgentCollapsed: (v: boolean) => void
  toggleCodeEditor: () => void
  toggleAgent: () => void

  isFocusMode: boolean
  focusedPanel: FocusedPanel
  toggleFocusMode: () => void
  setFocusedPanel: (panel: FocusedPanel) => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const [isCodeEditorCollapsed, setIsCodeEditorCollapsed] = useState(false)
  const [isAgentCollapsed, setIsAgentCollapsed] = useState(false)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [focusedPanel, setFocusedPanelState] = useState<FocusedPanel>('editor')

  const codeEditorRef = useRef<PanelImperativeHandle | null>(null)
  const agentRef = useRef<PanelImperativeHandle | null>(null)

  function toggleCodeEditor() {
    const panel = codeEditorRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
      setIsCodeEditorCollapsed(false)
    } else {
      panel.collapse()
      setIsCodeEditorCollapsed(true)
    }
  }

  function toggleAgent() {
    const panel = agentRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
      setIsAgentCollapsed(false)
    } else {
      panel.collapse()
      setIsAgentCollapsed(true)
    }
  }

  function toggleFocusMode() {
    setIsFocusMode((v) => !v)
  }

  function setFocusedPanel(panel: FocusedPanel) {
    setFocusedPanelState(panel)
  }

  return (
    <PanelContext.Provider
      value={{
        isCodeEditorCollapsed,
        isAgentCollapsed,
        codeEditorRef,
        agentRef,
        setIsCodeEditorCollapsed,
        setIsAgentCollapsed,
        toggleCodeEditor,
        toggleAgent,
        isFocusMode,
        focusedPanel,
        toggleFocusMode,
        setFocusedPanel,
      }}
    >
      {children}
    </PanelContext.Provider>
  )
}

export function usePanelContext() {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanelContext must be used within PanelProvider')
  return ctx
}

import { useCallback, useState } from 'react'

import type { EditorAPI } from './context'

export type DialogState =
  | {
      type: 'close-confirm'
      path: string
      onSave: () => Promise<void>
      onDiscard: () => void
      onCancel: () => void
    }
  | {
      type: 'external-conflict'
      path: string
      onKeepExternal: () => void
      onKeepMine: () => void
    }

interface UseEditorDialogsParams {
  dirtyTabsRef: React.RefObject<Set<string>>
  editorAPIRef: React.RefObject<EditorAPI | null>
  performCloseTab: (path: string) => void
  saveFile: (path: string, content: string) => Promise<void>
  setTabDirty: (path: string, dirty: boolean) => void
}

export interface EditorDialogs {
  dialogState: DialogState | null
  requestCloseTab: (path: string, e: React.MouseEvent) => void
  onExternalConflict: (path: string, externalContent: string) => void
}

export function useEditorDialogs({
  dirtyTabsRef,
  editorAPIRef,
  performCloseTab,
  saveFile,
  setTabDirty,
}: UseEditorDialogsParams): EditorDialogs {
  const [dialogState, setDialogState] = useState<DialogState | null>(null)

  const requestCloseTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!dirtyTabsRef.current.has(path)) {
        performCloseTab(path)
        return
      }
      setDialogState({
        type: 'close-confirm',
        path,
        onSave: async () => {
          const content = editorAPIRef.current?.getContent(path) ?? ''
          await saveFile(path, content)
          editorAPIRef.current?.applyContent(path, content)
          performCloseTab(path)
          setDialogState(null)
        },
        onDiscard: () => {
          setTabDirty(path, false)
          performCloseTab(path)
          setDialogState(null)
        },
        onCancel: () => setDialogState(null),
      })
    },
    [dirtyTabsRef, editorAPIRef, performCloseTab, saveFile, setTabDirty],
  )

  const onExternalConflict = useCallback(
    (path: string, externalContent: string) => {
      setDialogState({
        type: 'external-conflict',
        path,
        onKeepExternal: () => {
          editorAPIRef.current?.applyContent(path, externalContent)
          setDialogState(null)
        },
        onKeepMine: () => setDialogState(null),
      })
    },
    [editorAPIRef],
  )

  return { dialogState, requestCloseTab, onExternalConflict }
}

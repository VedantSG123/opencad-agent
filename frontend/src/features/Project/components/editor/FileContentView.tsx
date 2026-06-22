import { useCallback } from 'react'

import { useKernelFiles } from '@/hooks/useKernelFiles'

import { usePanelContext } from '../../context/PanelContext'
import { useEditor } from './context'
import { MonacoEditor } from './MonacoEditor'

export function FileContentView() {
  const { isFocusMode, focusedPanel } = usePanelContext()
  const {
    project,
    activeTab,
    isLoadingContent,
    fileContent,
    setSidebarOpen,
    openTabs,
    saveFile,
    setTabDirty,
    registerEditorAPI,
    onExternalConflict,
  } = useEditor()

  const setFileContent = useKernelFiles((state) => state.setFileContent)

  const handleContentChange = useCallback(
    (path: string, content: string) => setFileContent(path, content),
    [setFileContent],
  )

  if (!activeTab) {
    return (
      <div className='flex-1 flex items-center justify-center bg-background'>
        <button
          onClick={() => setSidebarOpen(true)}
          className='text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4'
        >
          Open a file from the sidebar
        </button>
      </div>
    )
  }

  const isTransparent = isFocusMode && focusedPanel === 'editor'

  return (
    <div
      className={`flex-1 relative overflow-hidden ${isTransparent ? 'bg-background/40' : 'bg-background'}`}
    >
      <MonacoEditor
        path={activeTab}
        content={fileContent}
        isLoading={isLoadingContent}
        openTabs={openTabs}
        kernel={project?.cad_kernel}
        onSave={saveFile}
        onDirtyChange={setTabDirty}
        onExternalConflict={onExternalConflict}
        onRegisterAPI={registerEditorAPI}
        onContentChange={handleContentChange}
      />
      {isLoadingContent && (
        <div className='absolute inset-0 flex items-center justify-center bg-background/60'>
          <span className='text-sm text-muted-foreground'>Loading…</span>
        </div>
      )}
    </div>
  )
}

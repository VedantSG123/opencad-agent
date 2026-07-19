import { EyeOffIcon } from '@hugeicons/core-free-icons'
import { useCallback } from 'react'

import { Icon } from '@/components/icons/HugeIcon'
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
    isBinaryFile,
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
          className='text-sm text-foreground/60 hover:text-foreground transition-colors underline underline-offset-4 cursor-pointer'
        >
          Open a file from the sidebar
        </button>
      </div>
    )
  }

  if (isBinaryFile) {
    return (
      <div className='flex-1 flex items-center justify-center p-6 bg-background/90'>
        <div className='max-w-md w-full p-8 rounded-2xl border border-muted/80 bg-surface/60 backdrop-blur-md shadow-xl flex flex-col items-center text-center space-y-4 transition-all duration-300 hover:border-foreground/30'>
          <div className='p-4 rounded-full bg-danger/10 text-danger border border-danger/20 animate-pulse'>
            <Icon icon={EyeOffIcon} size={32} />
          </div>
          <h3 className='text-lg font-semibold tracking-tight text-foreground'>
            Binary File Not Supported
          </h3>
          <p className='text-sm text-foreground/60 leading-relaxed'>
            This file is a binary file and cannot be opened in the text editor.
          </p>
        </div>
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
          <span className='text-sm text-foreground/60'>Loading…</span>
        </div>
      )}
    </div>
  )
}

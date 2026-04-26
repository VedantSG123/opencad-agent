import { useEditor } from './context'
import { MonacoEditor } from './MonacoEditor'

export function FileContentView() {
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

  return (
    <div className='flex-1 relative overflow-hidden bg-background'>
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
      />
      {isLoadingContent && (
        <div className='absolute inset-0 flex items-center justify-center bg-background/60'>
          <span className='text-sm text-muted-foreground'>Loading…</span>
        </div>
      )}
    </div>
  )
}

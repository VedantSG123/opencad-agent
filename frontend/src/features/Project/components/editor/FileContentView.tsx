import { useEditor } from './context'

export function FileContentView() {
  const { activeTab, isLoadingContent, fileContent, setSidebarOpen } =
    useEditor()

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

  if (isLoadingContent) {
    return (
      <div className='flex-1 flex items-center justify-center bg-background'>
        <span className='text-sm text-muted-foreground'>Loading…</span>
      </div>
    )
  }

  if (fileContent === null) {
    return (
      <div className='flex-1 flex items-center justify-center bg-background'>
        <span className='text-sm text-destructive'>Failed to load file</span>
      </div>
    )
  }

  return (
    <div className='flex-1 overflow-auto bg-background'>
      <pre className='p-4 text-xs font-mono whitespace-pre text-foreground leading-relaxed'>
        {fileContent}
      </pre>
    </div>
  )
}

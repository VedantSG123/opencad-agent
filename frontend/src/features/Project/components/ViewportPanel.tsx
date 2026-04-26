import { Code2 } from 'lucide-react'

import { usePanelContext } from '../context/PanelContext'

export function ViewportPanel() {
  const { isFocusMode, setFocusedPanel } = usePanelContext()

  return (
    <div className='h-full flex flex-col bg-card overflow-hidden'>
      {isFocusMode && (
        <div className='flex items-center gap-1 border-b px-1 h-10 shrink-0'>
          <button
            onClick={() => setFocusedPanel('editor')}
            className='flex items-center gap-1.5 px-2 h-7 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors'
          >
            <Code2 className='h-3.5 w-3.5' />
            Code Editor
          </button>
        </div>
      )}
      <div className='flex-1 flex items-center justify-center'>
        <span className='text-sm text-muted-foreground'>3D Viewport</span>
      </div>
    </div>
  )
}

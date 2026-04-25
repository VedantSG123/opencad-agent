import { TreeView } from '@/components/tree-view'
import { cn } from '@/lib/utils'

import { useEditor } from './context'

export function FileTree() {
  const { sidebarOpen, treeData, fsStatus, fsError, openFile } = useEditor()

  return (
    <div
      className={cn(
        'flex flex-col border-r overflow-hidden transition-all duration-200 shrink-0',
        sidebarOpen ? 'w-52' : 'w-0',
      )}
    >
      <div className='w-52 flex flex-col h-full overflow-hidden'>
        <p className='px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0'>
          Files
        </p>
        <div className='flex-1 overflow-auto'>
          {fsStatus === 'ready' ? (
            <TreeView
              data={treeData}
              onSelectChange={(item) => item && openFile(item)}
            />
          ) : fsStatus === 'connecting' ? (
            <p className='px-3 py-2 text-xs text-muted-foreground'>
              Connecting…
            </p>
          ) : (
            <p className='px-3 py-2 text-xs text-destructive'>
              {fsError ?? 'Connection closed'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

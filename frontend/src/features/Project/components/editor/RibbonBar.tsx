import {
  AlertTriangle,
  ArrowLeftRight,
  Box,
  Crown,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePanelContext } from '@/features/Project/context/PanelContext'
import { cn, toFsPath } from '@/lib/utils'

import { useEditor } from './context'
import { SetMainFileDialog } from './SetMainFileDialog'

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function RibbonBar() {
  const {
    project,
    sidebarOpen,
    setSidebarOpen,
    openTabs,
    activeTab,
    setActiveTab,
    requestCloseTab,
    dirtyTabs,
  } = useEditor()
  const { isFocusMode, setFocusedPanel, toggleConsole, isConsoleCollapsed } =
    usePanelContext()
  const [mainFileDialogOpen, setMainFileDialogOpen] = useState(false)

  const missingMainFile = project !== undefined && project.file === null

  const mainFileVirtualPath =
    project?.file && project.directory
      ? toFsPath(project.directory, project.file)
      : null

  return (
    <div className='flex items-center gap-1 border-b px-1 h-10 shrink-0'>
      <Button
        variant='ghost'
        size='icon'
        className='h-7 w-7 shrink-0'
        onClick={() => setSidebarOpen((v) => !v)}
      >
        {sidebarOpen ? (
          <PanelLeftClose className='h-4 w-4' />
        ) : (
          <PanelLeftOpen className='h-4 w-4' />
        )}
      </Button>

      <div className='w-px h-5 bg-border mx-1 shrink-0' />

      {missingMainFile && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setMainFileDialogOpen(true)}
              className='flex items-center gap-1 px-2 h-7 text-xs rounded-md shrink-0 text-amber-500 hover:bg-amber-500/10 transition-colors'
            >
              <AlertTriangle className='h-3.5 w-3.5' />
              No main file
            </button>
          </TooltipTrigger>
          <TooltipContent>
            This project has no main entry file set. Click to configure.
          </TooltipContent>
        </Tooltip>
      )}

      <div className='flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0 scrollbar-none'>
        {openTabs.map((path) => {
          const isDirty = dirtyTabs.has(path)
          const isMain = path === mainFileVirtualPath
          return (
            <button
              key={path}
              onClick={() => setActiveTab(path)}
              className={cn(
                'flex items-center gap-1.5 px-3 h-7 text-xs rounded-md shrink-0 max-w-40 group transition-colors',
                activeTab === path
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              {isMain && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Crown className='h-3 w-3 shrink-0 text-amber-400' />
                  </TooltipTrigger>
                  <TooltipContent>Main entry file</TooltipContent>
                </Tooltip>
              )}
              <span className='truncate'>{fileName(path)}</span>
              {/* Close/dirty indicator — same slot, swap on hover */}
              <span className='relative h-3.5 w-3.5 shrink-0 flex items-center justify-center'>
                {isDirty && (
                  <span className='absolute h-1.5 w-1.5 rounded-full bg-current group-hover:opacity-0 transition-opacity' />
                )}
                <span
                  role='button'
                  onClick={(e) => requestCloseTab(path, e)}
                  className='absolute inset-0 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity'
                >
                  <X className='h-2.5 w-2.5' />
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <Button
        variant='ghost'
        size='icon'
        className={cn(
          'h-7 w-7 shrink-0 transition-colors',
          !isConsoleCollapsed
            ? 'text-foreground bg-accent'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
        )}
        onClick={toggleConsole}
        title='Toggle execution console'
      >
        <Terminal className='h-4 w-4' />
      </Button>

      {isFocusMode && (
        <button
          onClick={() => setFocusedPanel('viewport')}
          className='flex items-center gap-2 px-2 h-7 text-xs rounded-md shrink-0 text-muted-foreground group hover:text-foreground hover:bg-accent/50 transition-colors'
        >
          <ArrowLeftRight className='h-4 w-4 group-hover:text-blue-500' />
          <div className='flex items-center gap-1'>
            <Box className='h-3.5 w-3.5' />
            <span>3D Viewport</span>
          </div>
        </button>
      )}

      <SetMainFileDialog
        open={mainFileDialogOpen}
        onClose={() => setMainFileDialogOpen(false)}
      />
    </div>
  )
}

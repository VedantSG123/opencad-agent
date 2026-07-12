import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'

import { PanelLeft } from '@/components/icons/PanelLeft'
import { PanelRight } from '@/components/icons/PanelRight'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { KERNEL_INFO } from '@/constants/kernels'
import type { Project } from '@/types/project'

import { usePanelContext } from '../context/PanelContext'

interface TopBarProps {
  project: Project | undefined
}

export function TopBar({ project }: TopBarProps) {
  const navigate = useNavigate()
  const {
    isCodeEditorCollapsed,
    isAgentCollapsed,
    isFocusMode,
    toggleCodeEditor,
    toggleAgent,
    toggleFocusMode,
  } = usePanelContext()

  const isElectron = typeof window !== 'undefined' && !!window.electron
  const isMac = isElectron && window.electron?.platform === 'darwin'
  const isWinOrLinux = isElectron && window.electron?.platform !== 'darwin'

  return (
    <header
      className={`flex items-center h-10 px-0 gap-3 shrink-0 select-none ${
        isElectron ? 'electron-drag' : ''
      } ${isMac ? 'pl-[80px] -mt-1' : ''} ${isWinOrLinux ? 'pr-[100px]' : ''}`}
    >
      <Button
        variant='ghost'
        size='icon'
        onClick={() => navigate(-1)}
        className='electron-no-drag shrink-0'
      >
        <ArrowLeft className='h-4 w-4' />
      </Button>

      {project && (
        <Tooltip>
          <TooltipTrigger asChild>
            <img
              src={KERNEL_INFO[project.cad_kernel].image}
              alt={KERNEL_INFO[project.cad_kernel].label}
              className='h-5 w-5 object-contain shrink-0 cursor-default'
            />
          </TooltipTrigger>
          <TooltipContent>
            {KERNEL_INFO[project.cad_kernel].label}
          </TooltipContent>
        </Tooltip>
      )}

      <span className='font-semibold truncate select-none'>
        {project?.name ?? '—'}
      </span>

      <div className='ml-auto flex items-center gap-0.5 electron-no-drag'>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className='flex items-center gap-1.5'>
              <Switch checked={isFocusMode} onCheckedChange={toggleFocusMode} />
              <span className='text-xs text-muted-foreground select-none'>
                Focus
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isFocusMode ? 'Exit focus mode' : 'Focus mode'}
          </TooltipContent>
        </Tooltip>

        <div className='w-px h-5 bg-border mx-1' />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleCodeEditor}
              className='p-0.5 rounded-md text-muted-foreground hover:text-foreground transition-colors'
            >
              <PanelLeft isCollapsed={isCodeEditorCollapsed} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isCodeEditorCollapsed ? 'Show code editor' : 'Hide code editor'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleAgent}
              className='p-0.5 rounded-md text-muted-foreground hover:text-foreground transition-colors'
            >
              <PanelRight isCollapsed={isAgentCollapsed} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isAgentCollapsed ? 'Show agent panel' : 'Hide agent panel'}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

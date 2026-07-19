import { Switch } from '@heroui/react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'

import { TitlebarIconButton } from '@/components/custom/TitlebarIconButton'
import { PanelLeft } from '@/components/icons/PanelLeft'
import { PanelRight } from '@/components/icons/PanelRight'
import { KERNEL_INFO } from '@/constants/kernels'
import { usePlatform } from '@/hooks/usePlatform'
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

  const { isElectron, isMac, isWinOrLinux } = usePlatform()

  return (
    <header
      className={`flex items-center h-8 px-0 gap-3 shrink-0 select-none ${
        isElectron ? 'electron-drag' : ''
      } ${isMac ? 'pl-[80px] -mt-1' : ''} ${isWinOrLinux ? 'pr-[100px]' : ''}`}
    >
      <TitlebarIconButton
        onPress={() => navigate(-1)}
        className='electron-no-drag'
      >
        <ArrowLeft className='h-4 w-4' />
      </TitlebarIconButton>

      {project && (
        <img
          src={KERNEL_INFO[project.cad_kernel].image}
          alt={KERNEL_INFO[project.cad_kernel].label}
          title={KERNEL_INFO[project.cad_kernel].label}
          className='h-5 w-5 object-contain shrink-0 cursor-default'
        />
      )}

      <span className='font-semibold truncate select-none'>
        {project?.name ?? '—'}
      </span>

      <div className='ml-auto flex items-center gap-0.5 electron-no-drag'>
        <div
          className='flex items-center gap-1.5 cursor-pointer'
          title={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
        >
          <Switch
            isSelected={isFocusMode}
            onChange={toggleFocusMode}
            size='sm'
          />
          <span className='text-xs text-default-500 select-none'>Focus</span>
        </div>

        <div className='w-px h-5 bg-default-200 mx-1' />

        <button
          onClick={toggleCodeEditor}
          className='p-0.5 rounded-md text-default-500 hover:text-foreground transition-colors'
          title={
            isCodeEditorCollapsed ? 'Show code editor' : 'Hide code editor'
          }
        >
          <PanelLeft isCollapsed={isCodeEditorCollapsed} />
        </button>

        <button
          onClick={toggleAgent}
          className='p-0.5 rounded-md text-default-500 hover:text-foreground transition-colors'
          title={isAgentCollapsed ? 'Show agent panel' : 'Hide agent panel'}
        >
          <PanelRight isCollapsed={isAgentCollapsed} />
        </button>
      </div>
    </header>
  )
}

import { Switch } from '@heroui/react'
import { ArrowLeft02Icon } from '@hugeicons/core-free-icons'
import { useNavigate } from 'react-router'

import { TitlebarIconButton } from '@/components/custom/TitlebarIconButton'
import { Icon } from '@/components/icons/HugeIcon'
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
      className={`flex items-center h-9 px-2 gap-3 shrink-0 select-none ${
        isElectron ? 'electron-drag' : ''
      } ${isMac ? 'pl-20' : ''} ${isWinOrLinux ? 'pr-36' : ''}`}
    >
      <TitlebarIconButton
        onPress={() => navigate(-1)}
        className='electron-no-drag'
      >
        <Icon icon={ArrowLeft02Icon} size={16} />
      </TitlebarIconButton>

      {project && (
        <img
          src={KERNEL_INFO[project.cad_kernel].image}
          alt={KERNEL_INFO[project.cad_kernel].label}
          title={KERNEL_INFO[project.cad_kernel].label}
          className='h-4 w-4 object-contain shrink-0 cursor-default'
        />
      )}

      <span className='font-medium text-xs text-foreground/80 truncate select-none'>
        {project?.name ?? '—'}
      </span>

      <div className='ml-auto flex items-center gap-4 electron-no-drag'>
        <div
          className='flex items-center gap-1 cursor-pointer'
          title={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
        >
          <Switch
            aria-label={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
            isSelected={isFocusMode}
            onChange={toggleFocusMode}
            size='sm'
          >
            <Switch.Content>
              <Switch.Control className='shadow'>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
          <span className='text-xs text-default-500 select-none'>Focus</span>
        </div>

        <div className='flex items-center'>
          <TitlebarIconButton
            onClick={toggleCodeEditor}
            aria-label={
              isCodeEditorCollapsed ? 'Show code editor' : 'Hide code editor'
            }
          >
            <PanelLeft isCollapsed={isCodeEditorCollapsed} size={16} />
          </TitlebarIconButton>

          <TitlebarIconButton
            onClick={toggleAgent}
            aria-label={
              isAgentCollapsed ? 'Show agent panel' : 'Hide agent panel'
            }
          >
            <PanelRight isCollapsed={isAgentCollapsed} size={16} />
          </TitlebarIconButton>
        </div>
      </div>
    </header>
  )
}

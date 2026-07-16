import { Button } from '@heroui/react'
import { Layers, Plus } from 'lucide-react'

import { ThemeToggle } from '@/components/custom/ThemeToggle'

interface DashboardHeaderProps {
  onNewProject: () => void
}

export function DashboardHeader({ onNewProject }: DashboardHeaderProps) {
  const isElectron = typeof window !== 'undefined' && !!window.electron
  const isMac = isElectron && window.electron?.platform === 'darwin'
  const isWinOrLinux = isElectron && window.electron?.platform !== 'darwin'

  return (
    <header
      className={`sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm select-none ${
        isElectron ? 'electron-drag' : ''
      }`}
    >
      <div
        className={`max-w-7xl mx-auto px-6 h-14 flex items-center justify-between ${
          isMac ? 'pl-[100px] -mt-1' : ''
        } ${isWinOrLinux ? 'pr-[140px]' : ''}`}
      >
        <div className='flex items-center gap-2.5'>
          <div className='w-7 h-7 rounded-md bg-primary flex items-center justify-center'>
            <Layers className='w-4 h-4 text-primary-foreground' />
          </div>
          <span className='font-bold text-lg leading-none select-none'>
            OpenCAD Agent
          </span>
        </div>
        <div className='flex items-center gap-2 electron-no-drag'>
          <Button size='sm' onPress={onNewProject} className='electron-no-drag'>
            <Plus className='h-4 w-4 mr-1.5' />
            New Project
          </Button>
          <div className='electron-no-drag'>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}

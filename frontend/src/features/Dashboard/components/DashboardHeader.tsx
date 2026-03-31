import { Layers, Plus } from 'lucide-react'

import { ThemeToggle } from '@/components/custom/ThemeToggle'
import { Button } from '@/components/ui/button'

interface DashboardHeaderProps {
  onNewProject: () => void
}

export function DashboardHeader({ onNewProject }: DashboardHeaderProps) {
  return (
    <header className='sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm'>
      <div className='max-w-7xl mx-auto px-6 h-14 flex items-center justify-between'>
        <div className='flex items-center gap-2.5'>
          <div className='w-7 h-7 rounded-md bg-primary flex items-center justify-center'>
            <Layers className='w-4 h-4 text-primary-foreground' />
          </div>
          <span className='font-bold text-lg leading-none'>OpenCAD Agent</span>
        </div>
        <div className='flex items-center gap-2'>
          <Button size='sm' onClick={onNewProject}>
            <Plus className='h-4 w-4 mr-1.5' />
            New Project
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

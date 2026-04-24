import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { KERNEL_INFO } from '@/constants/kernels'
import type { Project } from '@/types/project'

interface TopBarProps {
  project: Project | undefined
}

export function TopBar({ project }: TopBarProps) {
  const navigate = useNavigate()

  return (
    <header className='flex items-center h-12 px-0 gap-3 shrink-0'>
      <Button variant='ghost' size='icon' onClick={() => navigate('/')}>
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

      <span className='font-semibold truncate'>{project?.name ?? '—'}</span>
    </header>
  )
}

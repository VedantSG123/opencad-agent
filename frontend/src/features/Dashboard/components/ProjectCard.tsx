import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { KERNEL_INFO } from '@/constants/kernels'
import type { Project } from '@/types/project'
import { formatRelativeTime, truncatePath } from '@/utils/date'

interface ProjectCardProps {
  project: Project
  onRename: () => void
  onDelete: () => void
}

export function ProjectCard({ project, onRename, onDelete }: ProjectCardProps) {
  const kernel = KERNEL_INFO[project.cad_kernel] ?? KERNEL_INFO.replicad

  return (
    <Card className='group overflow-hidden hover:shadow-md transition-all cursor-pointer gap-0 py-0'>
      <CardContent className='p-0'>
        <div className='relative bg-muted/40 flex items-center justify-center h-28 border-b'>
          <img
            src={kernel.image}
            alt={kernel.label}
            className='h-14 w-14 object-contain'
          />
          <div className='absolute top-1.5 right-1.5'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity'
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={onRename}>
                  <Pencil className='mr-2 h-4 w-4' />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className='text-destructive focus:text-destructive'
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className='p-4 space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='font-semibold text-sm leading-tight truncate'>
              {project.name}
            </h3>
            <Badge variant='secondary' className='text-xs shrink-0'>
              {kernel.label}
            </Badge>
          </div>
          <p
            className='text-xs text-muted-foreground font-mono truncate'
            title={project.directory}
          >
            {truncatePath(project.directory)}
          </p>
          <p className='text-xs text-muted-foreground'>
            Updated {formatRelativeTime(project.time.updated)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectCardSkeleton() {
  return (
    <Card className='overflow-hidden gap-0 py-0'>
      <CardContent className='p-0'>
        <Skeleton className='h-28 rounded-none' />
        <div className='p-4 space-y-2'>
          <Skeleton className='h-4 w-3/4' />
          <Skeleton className='h-3 w-full' />
          <Skeleton className='h-3 w-1/3' />
        </div>
      </CardContent>
    </Card>
  )
}

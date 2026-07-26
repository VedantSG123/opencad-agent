import { Button, Card, Chip, Dropdown, Skeleton } from '@heroui/react'
import {
  Delete01Icon,
  Edit02Icon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'
import { KERNEL_INFO } from '@/constants/kernels'
import type { Project } from '@/types/project'
import { formatRelativeTime, truncatePath } from '@/utils/date'

interface ProjectCardProps {
  project: Project
  onRename: () => void
  onDelete: () => void
  onClick: () => void
  sortBy?: 'last_accessed_at' | 'created_at'
}

export function ProjectCard({
  project,
  onRename,
  onDelete,
  onClick,
  sortBy,
}: ProjectCardProps) {
  const kernel = KERNEL_INFO[project.cad_kernel] ?? KERNEL_INFO.replicad

  return (
    <Card
      className='group overflow-hidden hover:shadow-md transition-all cursor-pointer gap-0'
      onClick={onClick}
    >
      <Card.Content>
        <div className='relative bg-default-100 flex items-center justify-center h-32 border-b -mx-4 -mt-4'>
          <img
            src={kernel.image}
            alt={kernel.label}
            className='h-14 w-14 object-contain'
          />
          <div className='absolute top-4 right-4'>
            <Dropdown>
              <Button
                variant='ghost'
                isIconOnly
                className='h-7 w-7 opacity-0 group-hover:opacity-100 aria-expanded:opacity-100 transition-opacity'
              >
                <Icon icon={MoreHorizontalIcon} size={16} />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label='Project actions'
                  onAction={(key) => {
                    if (key === 'rename') onRename()
                    if (key === 'delete') onDelete()
                  }}
                >
                  <Dropdown.Item id='rename' textValue='Rename'>
                    <div className='flex items-center gap-2'>
                      <Icon icon={Edit02Icon} size={16} />
                      Rename
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item
                    id='delete'
                    textValue='Delete'
                    variant='danger'
                  >
                    <div className='flex items-center gap-2'>
                      <Icon icon={Delete01Icon} size={16} />
                      Delete
                    </div>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </div>
        <div className='space-y-2 mt-2'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='font-medium text-sm text-foreground/70 leading-tight truncate'>
              {project.name}
            </h3>
            <Chip
              variant='soft'
              color='default'
              size='sm'
              className='text-xs shrink-0'
            >
              {kernel.label}
            </Chip>
          </div>
          <p
            className='text-xs truncate text-foreground/70'
            title={project.directory}
          >
            {truncatePath(project.directory)}
          </p>
          <p className='text-xs text-muted'>
            {sortBy === 'created_at' || !project.time.accessed
              ? `Created at ${formatRelativeTime(project.time.created)}`
              : `Opened ${formatRelativeTime(project.time.accessed)}`}
          </p>
        </div>
      </Card.Content>
    </Card>
  )
}

export function ProjectCardSkeleton() {
  return (
    <Card className='overflow-hidden gap-0 py-0'>
      <Card.Content className='p-0'>
        <Skeleton className='h-28 rounded-none' />
        <div className='p-4 space-y-2'>
          <Skeleton className='h-4 w-3/4 rounded-lg' />
          <Skeleton className='h-3 w-full rounded-lg' />
          <Skeleton className='h-3 w-1/3 rounded-lg' />
        </div>
      </Card.Content>
    </Card>
  )
}

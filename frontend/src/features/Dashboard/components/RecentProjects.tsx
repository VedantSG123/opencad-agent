import { Button, Skeleton } from '@heroui/react'
import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { Link } from 'react-router'

import { Icon } from '@/components/icons/HugeIcon'
import { KERNEL_INFO } from '@/constants/kernels'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'
import { formatRelativeTime } from '@/utils/date'

interface RecentProjectsProps {
  projects: Project[] | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

const RECENT_PROJECT_LIMIT = 6

export function RecentProjects({
  projects,
  isLoading,
  isError,
  onRetry,
}: RecentProjectsProps) {
  const recentProjects = (projects ?? [])
    .flatMap((project) =>
      project.time.accessed
        ? [{ project, accessed: project.time.accessed }]
        : [],
    )
    .sort(
      (a, b) =>
        Date.parse(b.accessed) - Date.parse(a.accessed) ||
        b.project.id.localeCompare(a.project.id),
    )
    .slice(0, RECENT_PROJECT_LIMIT)

  return (
    <section
      aria-labelledby='recent-projects-heading'
      className='@container mt-6 pt-4'
    >
      <div className='mb-2 px-1 flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center'>
        <h2 id='recent-projects-heading' className='text font-medium'>
          Recent projects
        </h2>
        <Link
          to='/projects'
          className='recent-project-link inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-muted whitespace-nowrap hover:text-foreground'
        >
          View all projects
          <Icon icon={ArrowRight02Icon} size={14} />
        </Link>
      </div>

      {isLoading ? (
        <div role='status' className='grid gap-4 @xl:grid-cols-2'>
          <span className='sr-only'>Loading recent projects</span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className='h-18 rounded-lg' />
          ))}
        </div>
      ) : isError ? (
        <div
          role='alert'
          className='flex flex-wrap items-center justify-between gap-3 py-4'
        >
          <p className='text-sm text-muted'>
            Recent projects couldn't be loaded.
          </p>
          <Button size='sm' variant='tertiary' onPress={onRetry}>
            Try again
          </Button>
        </div>
      ) : recentProjects.length === 0 ? (
        <p className='py-5 text-sm text-muted'>
          Projects you open will appear here. Start with a new idea above or
          open a project from your library.
        </p>
      ) : (
        <ul
          className={cn(
            'relative grid @xl:grid-cols-2',
            recentProjects.length > 1 &&
              '@xl:before:pointer-events-none @xl:before:absolute @xl:before:inset-y-0 @xl:before:left-1/2 @xl:before:z-10 @xl:before:border-l @xl:before:border-border/60',
          )}
        >
          {recentProjects.map(({ project, accessed }) => {
            const kernel = KERNEL_INFO[project.cad_kernel]
            return (
              <li
                key={project.id}
                className='min-w-0 border-b border-border/60 last:border-b-0 @xl:[&:nth-last-child(2):nth-child(odd)]:border-b-0'
              >
                <Link
                  to={`/project/${project.id}`}
                  className='recent-project-link group flex h-full min-w-0 items-center gap-3 px-4 py-4 hover:bg-default/60 active:bg-default'
                >
                  <span className='flex size-10 shrink-0 items-center justify-center bg-surface'>
                    <img
                      src={kernel.image}
                      alt=''
                      className='size-6 object-contain'
                    />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span
                      className='block truncate text-sm font-medium'
                      title={project.name}
                    >
                      {project.name}
                    </span>
                    <span
                      className='mt-1 block truncate text-xs text-muted'
                      title={project.directory}
                    >
                      {project.directory}
                    </span>
                    <span className='mt-1 block truncate text-xs text-muted'>
                      {kernel.label} · Opened{' '}
                      <time
                        dateTime={accessed}
                        title={new Date(accessed).toLocaleString()}
                      >
                        {formatRelativeTime(accessed)}
                      </time>
                    </span>
                  </span>
                  <Icon
                    icon={ArrowRight02Icon}
                    size={16}
                    className='shrink-0 text-muted group-hover:text-foreground group-focus-visible:text-foreground'
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

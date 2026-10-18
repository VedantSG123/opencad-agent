import { Button } from '@heroui/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'
import type { AgentSession } from '@/types/agent'
import { formatRelativeTime } from '@/utils/date'

interface SessionsHomeProps {
  projectName: string
  sessions: AgentSession[]
  onOpen: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

export function SessionsHome({
  projectName,
  sessions,
  onOpen,
  onDelete,
}: SessionsHomeProps) {
  if (sessions.length === 0) {
    return (
      <div className='flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center'>
        <p className='text-sm font-medium text-foreground'>
          What should we build?
        </p>
        <p className='text-xs text-muted'>
          The agent reads and edits the files in {projectName}.
        </p>
      </div>
    )
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2'>
      <ul className='flex flex-col'>
        {sessions.map((session) => (
          <li
            key={session.id}
            className='group relative flex items-center p-0.5 rounded-md transition-colors hover:bg-muted/10 focus-within:bg-muted/10'
          >
            <button
              type='button'
              onClick={() => onOpen(session.id)}
              className='flex min-w-0 flex-1 items-baseline gap-3 rounded-md px-2 py-2 text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none'
            >
              <span className='min-w-0 flex-1 truncate text-sm text-foreground'>
                {session.title}
              </span>
              <span className='shrink-0 text-[11px] text-muted tabular-nums group-hover:invisible group-focus-within:invisible'>
                {formatRelativeTime(session.time.updated)}
              </span>
            </button>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label={`Delete ${session.title}`}
              className='absolute right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              onPress={() => onDelete(session.id)}
            >
              <Icon icon={Delete02Icon} size={14} />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

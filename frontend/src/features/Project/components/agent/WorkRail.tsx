import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { isToolUIPart } from 'ai'
import { useId, useState } from 'react'
import type { PermissionPrompt } from 'shared'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'
import type { AgentUIMessage } from '@/types/agent'

import { Markdown } from './Markdown'
import { ToolCallRow } from './ToolCallRow'
import { railLabel, type Turn } from './turn'

interface WorkRailProps {
  sessionId: string
  message: AgentUIMessage
  turn: Turn
  isLive: boolean
  permissions: Map<string, PermissionPrompt>
}

export function WorkRail({
  sessionId,
  message,
  turn,
  isLive,
  permissions,
}: WorkRailProps) {
  const contentId = useId()
  const [toggled, setToggled] = useState<boolean | null>(null)
  const awaitingAnswer = [...permissions.values()].some(
    (prompt) => prompt.answered === undefined,
  )
  const isOpen = toggled ?? (isLive || awaitingAnswer)

  return (
    <section className='flex flex-col'>
      <button
        type='button'
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setToggled(!isOpen)}
        className='-ml-1.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-muted/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none'
      >
        <span className={cn(isLive && 'text-shimmer')}>
          {railLabel(turn, message, isLive)}
        </span>
        <Icon
          icon={ArrowDown01Icon}
          size={12}
          className={cn(
            'transition-transform duration-150 motion-reduce:transition-none',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen && (
        <div
          id={contentId}
          className='mt-2 ml-1 flex flex-col gap-2.5 border-l border-separator pl-3'
        >
          {turn.work.map((part, index) => {
            if (isToolUIPart(part)) {
              return (
                <ToolCallRow
                  key={part.toolCallId}
                  sessionId={sessionId}
                  part={part}
                  permission={permissions.get(part.toolCallId)}
                />
              )
            }
            if (part.type === 'reasoning' && part.text) {
              return (
                <p
                  key={index}
                  className='text-xs leading-relaxed whitespace-pre-wrap text-muted'
                >
                  {part.text}
                </p>
              )
            }
            if (part.type === 'text' && part.text) {
              return (
                <Markdown
                  key={index}
                  text={part.text}
                  className='text-[13px] text-foreground/75'
                />
              )
            }
            return null
          })}
        </div>
      )}
    </section>
  )
}

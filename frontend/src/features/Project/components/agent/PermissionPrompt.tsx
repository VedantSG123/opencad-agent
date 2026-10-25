import { Button } from '@heroui/react'
import {
  Cancel01Icon,
  ClockFadingIcon,
  ShieldKeyIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import type { PermissionPrompt as Prompt, PermissionScope } from 'shared'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import { useAnswerPermission } from '@/hooks/useAgentSessions'
import { extractErrorMessage } from '@/hooks/useProjects'

const ANSWERED: Record<PermissionScope, string> = {
  once: 'Allowed once',
  session: 'Allowed for this session',
  project: 'Allowed for this project',
}

export function PermissionPrompt({
  sessionId,
  prompt,
}: {
  sessionId: string
  prompt: Prompt
}) {
  const answer = useAnswerPermission(sessionId)

  if (prompt.answered !== undefined) {
    const resolvedIcon = prompt.expired
      ? ClockFadingIcon
      : prompt.answered
        ? Tick02Icon
        : Cancel01Icon
    const resolvedTone = prompt.expired
      ? 'text-muted'
      : prompt.answered
        ? 'text-success'
        : 'text-danger'
    return (
      <p className='flex items-center gap-1 pt-0.5 pl-5 text-[11px] text-muted'>
        <Icon
          icon={resolvedIcon}
          size={12}
          className={`shrink-0 ${resolvedTone}`}
        />
        {prompt.expired
          ? 'Not answered in time, so it was not run.'
          : prompt.answered
            ? ANSWERED[prompt.answered]
            : 'Denied'}
      </p>
    )
  }

  function respond(scope: PermissionScope | null) {
    answer.mutate(
      { toolCallId: prompt.toolCallId, scope },
      {
        onError: (error) =>
          toast.error(extractErrorMessage(error, 'Could not send the answer.')),
      },
    )
  }

  const { request } = prompt
  return (
    <div className='mt-0.5 flex flex-col gap-2 rounded-lg border border-separator bg-surface p-3'>
      <p className='flex items-start gap-1.5 text-xs font-medium text-foreground'>
        <Icon icon={ShieldKeyIcon} size={13} className='mt-px shrink-0 text-warning' />
        {request.title}
      </p>
      <code className='min-w-0 rounded-md bg-muted/10 px-2 py-1.5 font-mono text-[11px] leading-relaxed break-words text-foreground/80'>
        {request.subject}
      </code>
      {request.explanation && (
        <p className='text-[11px] leading-relaxed text-muted'>
          {asSentence(request.explanation)}
        </p>
      )}
      <div className='flex flex-col gap-1'>
        {request.choices.map((choice) => (
          <Button
            key={choice.scope}
            size='sm'
            variant={choice.scope === 'once' ? 'primary' : 'secondary'}
            className='min-w-0 justify-start px-2.5 text-xs whitespace-nowrap'
            isDisabled={answer.isPending}
            onPress={() => respond(choice.scope)}
          >
            <span title={choice.label} className='min-w-0 truncate'>
              {choice.label}
            </span>
          </Button>
        ))}
        <div className='mt-1 border-t border-separator pt-1'>
          <Button
            size='sm'
            variant='tertiary'
            className='min-w-0 justify-start px-2.5 text-xs whitespace-nowrap'
            isDisabled={answer.isPending}
            onPress={() => respond(null)}
          >
            Deny
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The policy words these as clauses ("it redirects output, ..."). */
function asSentence(text: string): string {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

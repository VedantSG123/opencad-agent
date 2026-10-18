import { Button } from '@heroui/react'
import type { PermissionPrompt as Prompt, PermissionScope } from 'shared'
import { toast } from 'sonner'

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
    return (
      <p className='pt-0.5 pl-5 text-[11px] text-muted'>
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
    <div className='mt-1.5 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5'>
      <p className='text-xs font-semibold text-foreground'>{request.title}</p>
      <code className='rounded bg-muted/15 px-1.5 py-1 text-xs break-all text-foreground/80'>
        {request.subject}
      </code>
      {request.explanation && (
        <p className='text-xs text-foreground/70'>
          {asSentence(request.explanation)}
        </p>
      )}
      <div className='flex flex-wrap gap-1.5'>
        {request.choices.map((choice) => (
          <Button
            key={choice.scope}
            size='sm'
            variant={choice.scope === 'once' ? 'primary' : 'secondary'}
            isDisabled={answer.isPending}
            onPress={() => respond(choice.scope)}
          >
            {choice.label}
          </Button>
        ))}
        <Button
          size='sm'
          variant='tertiary'
          isDisabled={answer.isPending}
          onPress={() => respond(null)}
        >
          Deny
        </Button>
      </div>
    </div>
  )
}

/** The policy words these as clauses ("it redirects output, ..."). */
function asSentence(text: string): string {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

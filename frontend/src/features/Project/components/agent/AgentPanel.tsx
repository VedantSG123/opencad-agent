import { Button, Tooltip } from '@heroui/react'
import { ArrowLeft01Icon, ChatAdd01Icon } from '@hugeicons/core-free-icons'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import type { SelectedModel } from '@/features/Providers/components/ModelSelectButton'
import {
  useAgentSessions,
  useCreateAgentSession,
  useDeleteAgentSession,
} from '@/hooks/useAgentSessions'
import { extractErrorMessage } from '@/hooks/useProjects'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { toFsPath } from '@/lib/utils'
import type { Project } from '@/types/project'

import { useEditor } from '../editor/context'
import { Composer } from './Composer'
import { Conversation, type PendingMessage } from './Conversation'
import { SessionsHome } from './SessionsHome'

const TITLE_LENGTH = 60

export function AgentPanel({ project }: { project: Project }) {
  const { data: sessions = [], isPending: isLoadingSessions } =
    useAgentSessions(project.id)
  const createSession = useCreateAgentSession(project.id)
  const deleteSession = useDeleteAgentSession(project.id)
  const { preferences, updatePreferences } = useUserPreferences()
  const { openFile } = useEditor()
  const initialPrompt = useInitialPrompt()

  const [openSessionId, setOpenSessionId] = useOpenSession()
  const [model, setModel] = useState<SelectedModel | null>(null)
  const [pending, setPending] = useState<
    (PendingMessage & { sessionId: string }) | null
  >(null)

  const openSession = sessions.find((session) => session.id === openSessionId)

  function changeModel(next: SelectedModel) {
    setModel(next)
    updatePreferences({ lastUsedModel: next })
  }

  function startSession(message: PendingMessage) {
    createSession.mutate(titleFrom(message), {
      onSuccess: (session) => {
        setPending({ ...message, sessionId: session.id })
        setOpenSessionId(session.id)
      },
      onError: (error) =>
        toast.error(extractErrorMessage(error, 'Could not start a chat.')),
    })
  }

  useEffect(() => {
    if (initialPrompt.text && model) {
      initialPrompt.consume()
      startSession({ text: initialPrompt.text, files: [] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt.text, model])

  function openChangedFile(path: string) {
    const virtualPath = toFsPath(project.directory, path)
    if (!virtualPath) return
    openFile({ id: virtualPath, name: virtualPath.split('/').at(-1) ?? path })
  }

  if (openSessionId) {
    return (
      <div className='flex h-full w-full flex-col bg-card'>
        <header className='flex h-10 shrink-0 items-center gap-1 border-b border-separator p-0.5'>
          <Tooltip>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='All chats'
              onPress={() => setOpenSessionId(null)}
              className={'w-7 h-7'}
            >
              <Icon icon={ArrowLeft01Icon} size={16} />
            </Button>
            <Tooltip.Content>All chats</Tooltip.Content>
          </Tooltip>
          <h2 className='min-w-0 flex-1 truncate text-sm font-medium text-foreground'>
            {openSession?.title}
          </h2>
          <Tooltip>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='New chat'
              onPress={() => setOpenSessionId(null)}
              className={'w-7 h-7'}
            >
              <Icon icon={ChatAdd01Icon} size={16} />
            </Button>
            <Tooltip.Content>New chat</Tooltip.Content>
          </Tooltip>
        </header>
        <Conversation
          key={openSessionId}
          sessionId={openSessionId}
          projectId={project.id}
          model={model}
          onModelChange={changeModel}
          preferredModel={preferences?.lastUsedModel}
          pending={pending?.sessionId === openSessionId ? pending : undefined}
          onPendingSent={() => setPending(null)}
          onOpenFile={openChangedFile}
        />
      </div>
    )
  }

  return (
    <div className='flex h-full w-full flex-col bg-card'>
      <header className='flex h-10 shrink-0 items-center border-b border-separator px-4'>
        <h2 className='text-sm font-medium text-foreground'>Chats</h2>
      </header>
      {isLoadingSessions ? (
        <div className='flex-1' />
      ) : (
        <SessionsHome
          projectName={project.name}
          sessions={sessions}
          onOpen={setOpenSessionId}
          onDelete={(id) =>
            deleteSession.mutate(id, {
              onError: (error) =>
                toast.error(
                  extractErrorMessage(error, 'Could not delete the chat.'),
                ),
            })
          }
        />
      )}
      <Composer
        model={model}
        onModelChange={changeModel}
        preferredModel={preferences?.lastUsedModel}
        isWorking={createSession.isPending}
        onSend={(text, files) => startSession({ text, files })}
        onStop={() => {}}
        initialText={initialPrompt.text ?? ''}
        autoFocus
      />
    </div>
  )
}

/**
 * The chat on screen, kept in the URL so a reload - mid-turn included -
 * returns to it. `null` is the sessions page.
 */
function useOpenSession() {
  const [params, setParams] = useSearchParams()
  const open = params.get('chat')
  const setOpen = (sessionId: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (sessionId) next.set('chat', sessionId)
        else next.delete('chat')
        return next
      },
      { replace: true },
    )
  return [open, setOpen] as const
}

/**
 * The prompt the Dashboard hands over when it creates a project. Taken out of
 * the history entry once used, so a reload does not send it again.
 */
function useInitialPrompt() {
  const location = useLocation()
  const navigate = useNavigate()
  const state: unknown = location.state
  const text =
    typeof state === 'object' &&
    state !== null &&
    'initialPrompt' in state &&
    typeof state.initialPrompt === 'string' &&
    state.initialPrompt.trim()
      ? state.initialPrompt
      : null

  return {
    text,
    consume: () =>
      void navigate(location.pathname, { replace: true, state: null }),
  }
}

function titleFrom({ text, files }: PendingMessage): string {
  const line = text.trim().split('\n')[0] ?? ''
  if (!line) return files[0]?.filename ?? 'New chat'
  return line.length > TITLE_LENGTH
    ? `${line.slice(0, TITLE_LENGTH - 1)}…`
    : line
}

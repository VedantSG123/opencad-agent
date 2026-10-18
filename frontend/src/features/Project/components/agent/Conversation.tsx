import { Chat, useChat } from '@ai-sdk/react'
import type { FileUIPart } from 'ai'
import { useEffect, useRef, useState } from 'react'
import type { Attachment } from 'shared/attachments'

import type { SelectedModel } from '@/features/Providers/components/ModelSelectButton'
import {
  fetchAgentSession,
  useAbortAgentRun,
  useAgentSession,
  useInvalidateAgentSessions,
} from '@/hooks/useAgentSessions'
import { AgentTransport, RunLostError } from '@/lib/agentTransport'
import type { AgentSessionDetail, AgentUIMessage } from '@/types/agent'

import { Composer } from './Composer'
import { ErrorNote, MessageList } from './MessageList'

export interface PendingMessage {
  text: string
  files: Attachment[]
}

interface ConversationProps {
  sessionId: string
  projectId: string
  model: SelectedModel | null
  onModelChange: (model: SelectedModel) => void
  preferredModel?: SelectedModel
  /** Sent as soon as the conversation opens: the first message of a new session. */
  pending?: PendingMessage
  onPendingSent: () => void
  onOpenFile: (path: string) => void
}

/** Loads the stored conversation, which the chat needs before it can exist. */
export function Conversation(props: ConversationProps) {
  const { data, isPending, error } = useAgentSession(props.sessionId)

  if (isPending) {
    return (
      <p className='flex-1 p-4 text-xs text-muted'>Loading conversation…</p>
    )
  }
  if (error) {
    return (
      <div className='flex-1 p-4'>
        <ErrorNote
          text={`Could not load this conversation: ${error.message}`}
        />
      </div>
    )
  }
  return <ChatView detail={data} {...props} />
}

function ChatView({
  detail,
  sessionId,
  projectId,
  model,
  onModelChange,
  preferredModel,
  pending,
  onPendingSent,
  onOpenFile,
}: ConversationProps & { detail: AgentSessionDetail }) {
  const invalidateSessions = useInvalidateAgentSessions(projectId)
  const abort = useAbortAgentRun(sessionId)

  const [chat] = useState(() => {
    const instance: Chat<AgentUIMessage> = new Chat<AgentUIMessage>({
      id: sessionId,
      messages: restorable(detail),
      transport: new AgentTransport(),
      onFinish: () => void invalidateSessions(),
      onError: (error) => {
        // The stream died with the run, so what is on screen stops wherever
        // it got to. The database has everything the loop saved before that.
        if (error instanceof RunLostError) {
          void fetchAgentSession(sessionId).then((fresh) => {
            instance.messages = restorable(fresh)
          })
        }
      },
    })
    return instance
  })
  const { messages, status, error, sendMessage } = useChat({ chat })

  // Once per mount, by hand: `useChat`'s own `resume` option is an unguarded
  // effect, and StrictMode's second run would read the stream twice into one
  // message.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (detail.running) void chat.resumeStream()
    else if (pending && model) send(pending.text, pending.files)
    if (pending) onPendingSent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function send(text: string, files: Attachment[]) {
    if (!model) return
    void sendMessage(
      { text, files: files.map(toFilePart) },
      { body: { model } },
    )
  }

  const isWorking = status === 'submitted' || status === 'streaming'
  const lastError = messages.at(-1)?.metadata?.error
  return (
    <>
      <MessageList
        sessionId={sessionId}
        messages={messages}
        isWorking={isWorking}
        onOpenFile={onOpenFile}
      />
      {error && !lastError && (
        <div className='px-4 pb-2'>
          <ErrorNote text={error.message} />
        </div>
      )}
      <Composer
        model={model}
        onModelChange={onModelChange}
        preferredModel={preferredModel}
        isWorking={isWorking}
        onSend={send}
        onStop={() => abort.mutate()}
        initialText={pending && !model ? pending.text : ''}
      />
    </>
  )
}

/**
 * A live run is replayed from its first chunk, and the SDK continues the last
 * message when it is the assistant's. So the copy of that turn already saved
 * has to go, or every part of it would appear twice.
 */
function restorable(detail: AgentSessionDetail): AgentUIMessage[] {
  const last = detail.messages.at(-1)
  return detail.running && last?.role === 'assistant'
    ? detail.messages.slice(0, -1)
    : detail.messages
}

function toFilePart(file: Attachment): FileUIPart {
  return {
    type: 'file',
    mediaType: file.mime,
    url: file.url,
    ...(file.filename ? { filename: file.filename } : {}),
  }
}

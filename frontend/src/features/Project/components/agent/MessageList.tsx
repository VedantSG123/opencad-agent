import { AlertCircleIcon, File02Icon } from '@hugeicons/core-free-icons'
import { useEffect, useRef } from 'react'
import type { FileChanged, PermissionPrompt } from 'shared'

import { Icon } from '@/components/icons/HugeIcon'
import type { AgentUIMessage, AgentUIPart } from '@/types/agent'

import { CopyButton } from './CopyButton'
import { Markdown } from './Markdown'
import { splitTurn } from './turn'
import { WorkRail } from './WorkRail'

/** How close to the bottom still counts as following the conversation. */
const FOLLOW_THRESHOLD_PX = 48

interface MessageListProps {
  sessionId: string
  messages: AgentUIMessage[]
  isWorking: boolean
  onOpenFile: (path: string) => void
}

export function MessageList({
  sessionId,
  messages,
  isWorking,
  onOpenFile,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [messages, isWorking])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    following.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX
  }

  const last = messages.at(-1)
  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4'
    >
      {messages.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage
            key={message.id}
            sessionId={sessionId}
            message={message}
            isLive={isWorking && message === last}
            onOpenFile={onOpenFile}
          />
        ),
      )}
      {isWorking && last?.role !== 'assistant' && <WorkingLabel />}
    </div>
  )
}

function UserMessage({ message }: { message: AgentUIMessage }) {
  const text = textOf(message.parts)
  return (
    <div className='group flex w-full items-end justify-end gap-1'>
      {text && (
        <CopyButton
          text={text}
          label='Copy message'
          className='opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        />
      )}
      <div className='flex min-w-0 flex-col gap-2 rounded-lg bg-accent/10 px-3 py-2'>
        {message.parts.map((part, index) => {
          if (part.type === 'file') {
            return part.mediaType.startsWith('image/') ? (
              <img
                key={index}
                src={part.url}
                alt={part.filename ?? 'attachment'}
                className='max-h-40 w-fit max-w-full rounded-md border border-separator object-contain'
              />
            ) : (
              <span
                key={index}
                className='flex w-fit items-center gap-1 rounded border border-separator px-1.5 py-0.5 text-xs text-foreground/70'
              >
                <Icon icon={File02Icon} size={12} />
                {part.filename ?? part.mediaType}
              </span>
            )
          }
          if (part.type === 'text' && part.text) {
            return (
              <p
                key={index}
                className='text-sm whitespace-pre-wrap text-foreground'
              >
                {part.text}
              </p>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

function AssistantMessage({
  sessionId,
  message,
  isLive,
  onOpenFile,
}: {
  sessionId: string
  message: AgentUIMessage
  isLive: boolean
  onOpenFile: (path: string) => void
}) {
  const permissions = new Map<string, PermissionPrompt>()
  const changed = new Map<string, FileChanged>()
  for (const part of message.parts) {
    if (part.type === 'data-permission') {
      permissions.set(part.data.toolCallId, part.data)
    }
    if (part.type === 'data-file-changed') {
      changed.set(part.data.path, part.data)
    }
  }

  const turn = splitTurn(message)
  const answer = textOf(turn.answer)
  // The stream opens the message before the model says anything; until it
  // does, there is nothing else to show that the turn is alive.
  if (isLive && turn.work.length === 0 && !answer) return <WorkingLabel />

  return (
    <div className='group flex flex-col gap-2'>
      {turn.work.length > 0 && (
        <WorkRail
          sessionId={sessionId}
          message={message}
          turn={turn}
          isLive={isLive}
          permissions={permissions}
        />
      )}
      {turn.answer.map((part, index) =>
        part.type === 'text' && part.text ? (
          <Markdown key={index} text={part.text} />
        ) : null,
      )}
      {changed.size > 0 && (
        <ChangedFiles files={[...changed.values()]} onOpenFile={onOpenFile} />
      )}
      {message.metadata?.error && <ErrorNote text={message.metadata.error} />}
      {answer && !isLive && (
        <CopyButton
          text={answer}
          label='Copy reply as Markdown'
          className='-ml-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        />
      )}
    </div>
  )
}

function textOf(parts: AgentUIPart[]): string {
  return parts
    .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
    .join('\n\n')
    .trim()
}

function WorkingLabel() {
  return (
    <p role='status' className='text-shimmer w-fit text-xs'>
      Working
    </p>
  )
}

function ChangedFiles({
  files,
  onOpenFile,
}: {
  files: FileChanged[]
  onOpenFile: (path: string) => void
}) {
  return (
    <div className='flex flex-wrap items-center gap-1 pt-1'>
      <span className='mr-0.5 text-xs text-muted'>
        Changed {files.length === 1 ? '1 file' : `${files.length} files`}
      </span>
      {files.map((file) => (
        <button
          key={file.path}
          type='button'
          title={file.path}
          onClick={() => onOpenFile(file.path)}
          className='flex min-w-0 items-center gap-1 rounded border border-separator px-1 font-mono text-[11px] text-foreground/80 transition-colors hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none'
        >
          <span className='truncate'>{fileName(file.path)}</span>
        </button>
      ))}
    </div>
  )
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <div className='flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 p-2 text-xs text-danger'>
      <Icon icon={AlertCircleIcon} size={14} className='mt-px shrink-0' />
      <p className='wrap-break-words'>{text}</p>
    </div>
  )
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

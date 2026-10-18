import { Button, Tooltip } from '@heroui/react'
import {
  ArrowUp02Icon,
  Attachment01Icon,
  Cancel01Icon,
  File01Icon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { useRef, useState } from 'react'
import type { Attachment, AttachmentCapabilities } from 'shared/attachments'
import {
  ACCEPTED_EXTENSIONS,
  attachmentRefusal,
  attachmentSetRefusal,
} from 'shared/attachments'

import { Icon } from '@/components/icons/HugeIcon'
import {
  ModelSelectButton,
  type SelectedModel,
} from '@/features/Providers/components/ModelSelectButton'
import { useProviders } from '@/hooks/useProviders'

interface ComposerProps {
  model: SelectedModel | null
  onModelChange: (model: SelectedModel) => void
  preferredModel?: SelectedModel
  isWorking: boolean
  onSend: (text: string, files: Attachment[]) => void
  onStop: () => void
  initialText?: string
  autoFocus?: boolean
}

export function Composer({
  model,
  onModelChange,
  preferredModel,
  isWorking,
  onSend,
  onStop,
  initialText = '',
  autoFocus = false,
}: ComposerProps) {
  const [text, setText] = useState(initialText)
  const [files, setFiles] = useState<Attachment[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const capabilities = useAttachmentCapabilities(model)

  const refusal =
    files
      .map((file) => attachmentRefusal(file, capabilities))
      .find((reason) => reason !== null) ?? attachmentSetRefusal(files)
  const canAttach = capabilities.image || capabilities.pdf
  const canSend =
    (text.trim().length > 0 || files.length > 0) &&
    model !== null &&
    refusal === null &&
    !isWorking

  function send() {
    if (!canSend) return
    onSend(text, files)
    setText('')
    setFiles([])
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      send()
    }
  }

  async function handleFilesPicked(list: FileList | null) {
    if (!list) return
    const picked = await Promise.all([...list].map(readAttachment))
    setFiles((current) => [...current, ...picked])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className='border-t border-border p-2'>
      <div className='flex flex-col rounded-2xl border border-border bg-surface'>
        {files.length > 0 && (
          <div className='flex flex-wrap gap-1.5 px-3 pt-3'>
            {files.map((file, index) => (
              <AttachmentChip
                key={`${file.filename}-${index}`}
                file={file}
                onRemove={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
              />
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Ask the agent to build or change something…'
          rows={2}
          autoFocus={autoFocus}
          className='max-h-48 min-h-14 w-full resize-none bg-transparent px-3 pt-3 pb-1 text-sm text-foreground outline-none placeholder:text-foreground/40'
        />
        {refusal && <p className='px-3 pb-1 text-xs text-danger'>{refusal}</p>}
        <div className='flex items-center justify-between gap-2 px-2 pb-2'>
          <div className='flex min-w-0 items-center gap-1'>
            {canAttach && (
              <Tooltip>
                <Button
                  isIconOnly
                  size='sm'
                  variant='tertiary'
                  aria-label='Attach images or PDFs'
                  onPress={() => inputRef.current?.click()}
                >
                  <Icon icon={Attachment01Icon} size={16} />
                </Button>
                <Tooltip.Content>Attach images or PDFs</Tooltip.Content>
              </Tooltip>
            )}
            <input
              ref={inputRef}
              type='file'
              multiple
              accept={ACCEPTED_EXTENSIONS}
              className='hidden'
              onChange={(event) => void handleFilesPicked(event.target.files)}
            />
            <ModelSelectButton
              value={model}
              onChange={onModelChange}
              preferredModel={preferredModel}
            />
          </div>
          {isWorking ? (
            <Button
              isIconOnly
              size='sm'
              className='rounded-full'
              aria-label='Stop'
              onPress={onStop}
            >
              <Icon icon={StopIcon} size={16} />
            </Button>
          ) : (
            <Button
              isIconOnly
              size='sm'
              className='rounded-full bg-surface-foreground text-surface'
              aria-label='Send'
              isDisabled={!canSend}
              onPress={() => send()}
            >
              <Icon icon={ArrowUp02Icon} size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function useAttachmentCapabilities(
  model: SelectedModel | null,
): AttachmentCapabilities {
  const { data: providers } = useProviders()
  const input = model
    ? providers?.[model.providerId]?.models[model.modelId]?.capabilities.input
    : undefined
  return { image: input?.image ?? false, pdf: input?.pdf ?? false }
}

function AttachmentChip({
  file,
  onRemove,
}: {
  file: Attachment
  onRemove: () => void
}) {
  return (
    <span className='flex max-w-40 items-center gap-1 rounded-md border border-border py-0.5 pr-0.5 pl-1 text-xs text-foreground/80'>
      {file.mime.startsWith('image/') ? (
        <img src={file.url} alt='' className='h-5 w-5 rounded object-cover' />
      ) : (
        <Icon icon={File01Icon} size={12} className='shrink-0' />
      )}
      <span className='truncate'>{file.filename ?? file.mime}</span>
      <button
        type='button'
        aria-label={`Remove ${file.filename ?? 'attachment'}`}
        onClick={onRemove}
        className='rounded p-0.5 hover:bg-muted/20'
      >
        <Icon icon={Cancel01Icon} size={12} />
      </button>
    </span>
  )
}

function readAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result
      if (typeof url === 'string') {
        resolve({ mime: file.type, url, filename: file.name })
      } else {
        reject(new Error(`Could not read ${file.name}.`))
      }
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

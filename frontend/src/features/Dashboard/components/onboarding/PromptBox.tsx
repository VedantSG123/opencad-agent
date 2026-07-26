import { Button, Tooltip } from '@heroui/react'
import {
  ArrowUp02Icon,
  FolderOpenIcon,
  Loading02Icon,
} from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'
import { useFileDialog } from '@/hooks/useFileDialog'
import type { CadKernel } from '@/types/project'
import { truncatePath } from '@/utils/date'

import { KernelSelect } from './KernelSelect'
import { ModelSelectButton, type SelectedModel } from './ModelSelectButton'

interface PromptBoxProps {
  prompt: string
  onPromptChange: (prompt: string) => void
  kernel: CadKernel
  onKernelChange: (kernel: CadKernel) => void
  directory: string | null
  onDirectoryPicked: (path: string) => void
  model: SelectedModel | null
  onModelChange: (model: SelectedModel) => void
  preferredModel?: SelectedModel
  onSubmit: () => void
  canSubmit: boolean
  isSubmitting: boolean
}

export function PromptBox({
  prompt,
  onPromptChange,
  kernel,
  onKernelChange,
  directory,
  onDirectoryPicked,
  model,
  onModelChange,
  preferredModel,
  onSubmit,
  canSubmit,
  isSubmitting,
}: PromptBoxProps) {
  const fileDialog = useFileDialog()

  function handleBrowseDirectory() {
    fileDialog.open('directory', onDirectoryPicked)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSubmit && !isSubmitting) onSubmit()
    }
  }

  return (
    <div className='aurora-wrapper relative w-full max-w-3xl rounded-3xl border border-border bg-surface shadow-lg'>
      <div className='relative z-10 flex flex-col'>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Describe the 3D part you want to build…'
          autoFocus
          className='min-h-32 max-h-56 w-full resize-none overflow-y-auto bg-transparent px-6 pt-6 pb-4 text-base text-foreground outline-none placeholder:text-foreground/40'
        />
        <div className='flex items-center justify-between gap-2 px-4 pb-4 pt-2'>
          <div className='flex items-center gap-2'>
            <Tooltip>
              <Button
                variant='tertiary'
                size='sm'
                isIconOnly={!directory}
                onPress={handleBrowseDirectory}
                isDisabled={fileDialog.isActive}
              >
                {fileDialog.isActive ? (
                  <Icon
                    icon={Loading02Icon}
                    size={16}
                    className='animate-spin'
                  />
                ) : (
                  <Icon icon={FolderOpenIcon} size={16} />
                )}
                {directory && (
                  <span className='max-w-32 truncate'>
                    {truncatePath(directory, 20)}
                  </span>
                )}
              </Button>
              <Tooltip.Content>
                {directory ?? 'Choose a project directory'}
              </Tooltip.Content>
            </Tooltip>
            <KernelSelect value={kernel} onChange={onKernelChange} />
            <ModelSelectButton
              value={model}
              onChange={onModelChange}
              preferredModel={preferredModel}
            />
          </div>
          <Button
            isIconOnly
            className='rounded-full bg-surface-foreground text-surface'
            onPress={onSubmit}
            isDisabled={!canSubmit || isSubmitting}
            aria-label='Create project'
          >
            <Icon icon={ArrowUp02Icon} size={18} />
          </Button>
        </div>
      </div>
      <div className='aurora-frame' aria-hidden='true'>
        <div className='aurora-border' />
        <div className='aurora-glow' />
      </div>
    </div>
  )
}

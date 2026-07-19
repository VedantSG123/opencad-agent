import { Button, Input, Label } from '@heroui/react'
import { FolderOpenIcon, Loading02Icon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'
import { useFileDialog } from '@/hooks/useFileDialog'
import { joinPaths, normalizePath } from '@/lib/utils'
import type { CadKernel } from '@/types/project'

const KERNEL_EXTENSION: Record<CadKernel, string> = {
  replicad: '.js',
  openscad: '.scad',
}

interface DetailsStepProps {
  action: 'create' | 'open' | null
  kernel: CadKernel | null
  name: string
  directory: string
  onNameChange: (v: string) => void
  onDirectoryChange: (v: string) => void
}

export function DetailsStep({
  action,
  kernel,
  name,
  directory,
  onNameChange,
  onDirectoryChange,
}: DetailsStepProps) {
  const isOpen = action === 'open'
  const fileDialog = useFileDialog()

  function handleBrowseDirectory() {
    fileDialog.open('directory', (selectedPath) => {
      onDirectoryChange(normalizePath(selectedPath))
      // Auto-fill name from directory name if empty
      if (!name) {
        const parts = selectedPath.replace(/\\/g, '/').split('/')
        const dirName = parts[parts.length - 1]
        if (dirName) onNameChange(dirName)
      }
    })
  }

  const scriptPathPreview =
    !isOpen && directory && name && kernel
      ? joinPaths(joinPaths(directory, name), `main${KERNEL_EXTENSION[kernel]}`)
      : ''

  return (
    <div className='space-y-4'>
      <div className='text-center'>
        <p className='font-semibold text-base'>Project Details</p>
        <p className='text-foreground/60 text-sm mt-0.5'>
          {isOpen
            ? 'Select the existing project directory'
            : 'Configure your new project'}
        </p>
      </div>
      <div className='space-y-3'>
        {isOpen && (
          <div className='space-y-1.5'>
            <div className='flex gap-2 items-end'>
              <div className='flex flex-col gap-1.5 flex-1'>
                <Label htmlFor='wiz-dir-open'>Project Directory</Label>
                <Input
                  id='wiz-dir-open'
                  placeholder='/home/user/projects/mymodel'
                  value={directory}
                  onChange={(e) => onDirectoryChange(e.target.value)}
                  autoFocus
                  className='w-full'
                />
              </div>
              <Button
                type='button'
                variant='outline'
                isIconOnly
                onPress={handleBrowseDirectory}
                isDisabled={fileDialog.isActive}
                aria-label='Browse for project directory'
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
              </Button>
            </div>
            <p className='text-xs text-foreground/60'>
              Root directory of your existing CAD project
            </p>
          </div>
        )}
        <div className='flex flex-col gap-1'>
          <Label htmlFor='wiz-name'>Project Name</Label>
          <Input
            id='wiz-name'
            placeholder='My CAD Project'
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus={!isOpen}
            className='w-full'
          />
        </div>
        {!isOpen && (
          <div className='flex flex-col gap-4 mt-4'>
            <div className='flex gap-2 items-end mt-2'>
              <div className='flex flex-col gap-1 flex-1'>
                <Label htmlFor='wiz-dir'>Projects Directory</Label>
                <Input
                  id='wiz-dir'
                  placeholder='/home/user/projects'
                  value={directory}
                  onChange={(e) => onDirectoryChange(e.target.value)}
                  className='w-full'
                />
              </div>
              <Button
                type='button'
                variant='tertiary'
                isIconOnly
                onPress={handleBrowseDirectory}
                isDisabled={fileDialog.isActive}
                aria-label='Browse for directory'
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
              </Button>
            </div>
            {scriptPathPreview && (
              <p className='text-xs text-foreground/60 font-mono'>
                Project script path: {scriptPathPreview}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

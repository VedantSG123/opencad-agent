import { FolderOpen, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
        <p className='text-muted-foreground text-sm mt-0.5'>
          {isOpen
            ? 'Select the existing project directory'
            : 'Configure your new project'}
        </p>
      </div>
      <div className='space-y-3'>
        {isOpen && (
          <div className='space-y-1.5'>
            <Label htmlFor='wiz-dir-open'>Project Directory</Label>
            <div className='flex gap-2'>
              <Input
                id='wiz-dir-open'
                placeholder='/home/user/projects/mymodel'
                value={directory}
                onChange={(e) => onDirectoryChange(e.target.value)}
                autoFocus
              />
              <Button
                type='button'
                variant='outline'
                size='icon'
                onClick={handleBrowseDirectory}
                disabled={fileDialog.isActive}
                title='Browse for project directory'
              >
                {fileDialog.isActive ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <FolderOpen className='h-4 w-4' />
                )}
              </Button>
            </div>
            <p className='text-xs text-muted-foreground'>
              Root directory of your existing CAD project
            </p>
          </div>
        )}
        <div className='space-y-1.5'>
          <Label htmlFor='wiz-name'>Project Name</Label>
          <Input
            id='wiz-name'
            placeholder='My CAD Project'
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus={!isOpen}
          />
        </div>
        {!isOpen && (
          <div className='space-y-1.5'>
            <Label htmlFor='wiz-dir'>Projects Directory</Label>
            <div className='flex gap-2'>
              <Input
                id='wiz-dir'
                placeholder='/home/user/projects'
                value={directory}
                onChange={(e) => onDirectoryChange(e.target.value)}
              />
              <Button
                type='button'
                variant='outline'
                size='icon'
                onClick={handleBrowseDirectory}
                disabled={fileDialog.isActive}
                title='Browse for directory'
              >
                {fileDialog.isActive ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <FolderOpen className='h-4 w-4' />
                )}
              </Button>
            </div>
            {scriptPathPreview && (
              <p className='text-xs text-muted-foreground font-mono'>
                Project script path: {scriptPathPreview}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

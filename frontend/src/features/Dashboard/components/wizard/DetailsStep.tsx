import { FolderOpen, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileDialog } from '@/hooks/useFileDialog'
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
  file: string
  onNameChange: (v: string) => void
  onDirectoryChange: (v: string) => void
  onFileChange: (v: string) => void
}

export function DetailsStep({
  action,
  kernel,
  name,
  directory,
  file,
  onNameChange,
  onDirectoryChange,
  onFileChange,
}: DetailsStepProps) {
  const isOpen = action === 'open'
  const fileDialog = useFileDialog()

  // Open flow: input shows full path; on change split into directory + filename
  function handleFullPathChange(fullPath: string) {
    const normalized = fullPath.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    if (lastSlash > 0) {
      onDirectoryChange(normalized.slice(0, lastSlash))
      onFileChange(normalized.slice(lastSlash + 1))
    } else {
      onDirectoryChange('')
      onFileChange(normalized)
    }
  }

  function handleBrowseFile() {
    const extension = kernel ? KERNEL_EXTENSION[kernel] : undefined
    fileDialog.open(
      'file',
      (selectedPath) => {
        handleFullPathChange(selectedPath)
        // Auto-fill name from parent directory name if empty
        const parts = selectedPath.replace(/\\/g, '/').split('/')
        if (!name && parts.length >= 2) {
          onNameChange(parts[parts.length - 2])
        }
      },
      extension,
    )
  }

  function handleBrowseDirectory() {
    fileDialog.open('directory', (selectedPath) => {
      onDirectoryChange(selectedPath)
    })
  }

  const fullOpenPath = isOpen
    ? `${directory}${directory && file ? '/' : ''}${file}`
    : ''
  const scriptPathPreview =
    !isOpen && directory && name && kernel
      ? `${directory}/${name}/script${KERNEL_EXTENSION[kernel]}`
      : ''

  return (
    <div className='space-y-4'>
      <div className='text-center'>
        <p className='font-semibold text-base'>Project Details</p>
        <p className='text-muted-foreground text-sm mt-0.5'>
          {isOpen
            ? 'Tell us about your existing script'
            : 'Configure your new project'}
        </p>
      </div>
      <div className='space-y-3'>
        {isOpen && (
          <div className='space-y-1.5'>
            <Label htmlFor='wiz-file'>Script File Path</Label>
            <div className='flex gap-2'>
              <Input
                id='wiz-file'
                placeholder='/home/user/projects/mymodel/script.scad'
                value={fullOpenPath}
                onChange={(e) => handleFullPathChange(e.target.value)}
                autoFocus
              />
              <Button
                type='button'
                variant='outline'
                size='icon'
                onClick={handleBrowseFile}
                disabled={fileDialog.isActive}
                title='Browse for script file'
              >
                {fileDialog.isActive ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <FolderOpen className='h-4 w-4' />
                )}
              </Button>
            </div>
            <p className='text-xs text-muted-foreground'>
              Full filesystem path to your existing CAD script
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

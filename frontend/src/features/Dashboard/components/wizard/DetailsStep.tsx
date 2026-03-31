import { FolderOpen, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileDialog } from '@/hooks/useFileDialog'

interface DetailsStepProps {
  action: 'create' | 'open' | null
  name: string
  directory: string
  file: string
  onNameChange: (v: string) => void
  onDirectoryChange: (v: string) => void
  onFileChange: (v: string) => void
}

export function DetailsStep({
  action,
  name,
  directory,
  file,
  onNameChange,
  onDirectoryChange,
  onFileChange,
}: DetailsStepProps) {
  const isOpen = action === 'open'
  const fileDialog = useFileDialog()

  function handleFileChange(v: string) {
    onFileChange(v)
    const parts = v.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length > 1) {
      parts.pop()
      onDirectoryChange('/' + parts.join('/'))
      if (!name && parts.length > 0) {
        onNameChange(parts[parts.length - 1])
      }
    }
  }

  function handleBrowseFile() {
    fileDialog.open('file', (selectedPath) => {
      handleFileChange(selectedPath)
    })
  }

  function handleBrowseDirectory() {
    fileDialog.open('directory', (selectedPath) => {
      onDirectoryChange(selectedPath)
    })
  }

  const projectPreview =
    !isOpen && directory && name ? `${directory}/${name}` : ''

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
                value={file}
                onChange={(e) => handleFileChange(e.target.value)}
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
        <div className='space-y-1.5'>
          <Label htmlFor='wiz-dir'>
            {isOpen ? 'Working Directory' : 'Projects Directory'}
          </Label>
          <div className='flex gap-2'>
            <Input
              id='wiz-dir'
              placeholder='/home/user/projects'
              value={directory}
              onChange={(e) => onDirectoryChange(e.target.value)}
            />
            {!isOpen && (
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
            )}
          </div>
          {projectPreview && (
            <p className='text-xs text-muted-foreground font-mono'>
              Project folder: {projectPreview}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  extractErrorMessage,
  useInvalidateProjects,
  useRenameProject,
} from '@/hooks/useProjects'
import type { Project } from '@/types/project'

interface RenameDialogProps {
  project: Project | null
  onClose: () => void
}

export function RenameDialog({ project, onClose }: RenameDialogProps) {
  const [name, setName] = useState(project?.name || '')
  const { mutateAsync: renameProject } = useRenameProject()
  const { invalidateProjects } = useInvalidateProjects()
  const [isRenaming, setIsRenaming] = useState(false)

  async function handleConfirm() {
    if (!project || !name.trim() || name.trim() === project.name) return
    setIsRenaming(true)
    try {
      await renameProject({ id: project.id, payload: { name: name.trim() } })
      await invalidateProjects()
      toast.success('Project renamed')
      onClose()
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to rename project'))
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>Rename Project</DialogTitle>
          <DialogDescription>
            Enter a new name for &quot;{project?.name}&quot;
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-1.5 py-1'>
          <Label htmlFor='rename-input'>Project Name</Label>
          <Input
            id='rename-input'
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            autoFocus
          />
        </div>
        <div className='flex justify-end gap-2 pt-1'>
          <Button variant='outline' onClick={onClose} disabled={isRenaming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !name.trim() || name.trim() === project?.name || isRenaming
            }
          >
            {isRenaming ? 'Renaming…' : 'Rename'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

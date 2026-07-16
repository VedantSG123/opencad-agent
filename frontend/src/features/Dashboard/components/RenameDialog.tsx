import { Button, Input, Modal } from '@heroui/react'
import { useState } from 'react'
import { toast } from 'sonner'

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
    <Modal>
      <Modal.Backdrop
        isOpen={!!project}
        onOpenChange={(open) => !open && onClose()}
      >
        <Modal.Container size='sm'>
          <Modal.Dialog>
            <Modal.Header>
              <div className='flex flex-col gap-1'>
                <h3 className='text-lg font-bold'>Rename Project</h3>
                <p className='text-sm font-normal text-default-500'>
                  Enter a new name for &quot;{project?.name}&quot;
                </p>
              </div>
            </Modal.Header>
            <Modal.Body>
              <div className='flex flex-col gap-1.5'>
                <label htmlFor='rename-input' className='text-sm font-semibold'>
                  Project Name
                </label>
                <Input
                  id='rename-input'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                  autoFocus
                />
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant='outline'
                onPress={onClose}
                isDisabled={isRenaming}
              >
                Cancel
              </Button>
              <Button
                className='bg-primary text-white'
                onPress={handleConfirm}
                isDisabled={
                  !name.trim() || name.trim() === project?.name || isRenaming
                }
              >
                {isRenaming ? 'Renaming…' : 'Rename'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

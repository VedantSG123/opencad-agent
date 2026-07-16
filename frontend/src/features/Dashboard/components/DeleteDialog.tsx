import { Button, Modal } from '@heroui/react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  extractErrorMessage,
  useDeleteProject,
  useInvalidateProjects,
} from '@/hooks/useProjects'
import type { Project } from '@/types/project'

interface DeleteDialogProps {
  project: Project | null
  onClose: () => void
}

export function DeleteDialog({ project, onClose }: DeleteDialogProps) {
  const { mutateAsync: deleteProject } = useDeleteProject()
  const { invalidateProjects } = useInvalidateProjects()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleConfirm() {
    if (!project) return
    setIsDeleting(true)
    try {
      await deleteProject(project.id)
      await invalidateProjects()
      if (window.electron) {
        const res = await window.electron.refreshProjectRoots()
        if (!res.success) {
          throw new Error(res.error.message)
        }
      }
      toast.success('Project deleted')
      onClose()
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to delete project'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={!!project}
        onOpenChange={(open) => !open && onClose()}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <div className='flex flex-col gap-1'>
                <h3 className='text-lg font-bold'>Delete Project</h3>
                <p className='text-sm font-normal text-default-500'>
                  Are you sure you want to delete{' '}
                  <strong>&quot;{project?.name}&quot;</strong>? This action
                  cannot be undone.
                </p>
              </div>
            </Modal.Header>
            <Modal.Footer>
              <Button
                variant='outline'
                onPress={onClose}
                isDisabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                className='bg-danger text-white'
                onPress={handleConfirm}
                isDisabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

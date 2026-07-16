import { Modal } from '@heroui/react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className='max-w-sm'>
            <Modal.Header>
              <div className='flex flex-col gap-1'>
                <h3 className='text-xl font-bold'>Settings</h3>
                <p className='text-sm font-normal text-default-500'>
                  Configure your application preferences and settings here.
                </p>
              </div>
            </Modal.Header>
            <Modal.Body>
              <div className='py-6 flex flex-col items-center justify-center text-center text-muted-foreground text-sm select-none'>
                Settings options will be implemented here.
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

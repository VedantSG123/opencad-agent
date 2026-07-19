import { Button, Modal } from '@heroui/react'

import { useEditor } from './context'

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function EditorDialog() {
  const { dialogState } = useEditor()

  const isOpen = dialogState !== null

  if (!isOpen) return null

  return (
    <Modal isOpen={true}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            {dialogState.type === 'close-confirm' && (
              <>
                <Modal.Header>
                  <h3 className='text-lg font-bold'>Unsaved Changes</h3>
                </Modal.Header>
                <Modal.Body>
                  <p className='text-default-500 text-sm'>
                    Do you want to save the changes made to{' '}
                    <span className='font-medium text-foreground'>
                      {fileName(dialogState.path)}
                    </span>
                    ?
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant='outline' onPress={dialogState.onCancel}>
                    Cancel
                  </Button>
                  <Button
                    className='bg-danger text-white'
                    onPress={dialogState.onDiscard}
                  >
                    Don&apos;t Save
                  </Button>
                  <Button
                    className='bg-primary text-white'
                    onPress={() => void dialogState.onSave()}
                  >
                    Save
                  </Button>
                </Modal.Footer>
              </>
            )}

            {dialogState.type === 'external-conflict' && (
              <>
                <Modal.Header>
                  <h3 className='text-lg font-bold'>
                    File Modified Externally
                  </h3>
                </Modal.Header>
                <Modal.Body>
                  <p className='text-default-500 text-sm'>
                    <span className='font-medium text-foreground'>
                      {fileName(dialogState.path)}
                    </span>{' '}
                    has been modified externally. You have unsaved changes that
                    would be overwritten. What would you like to do?
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant='outline' onPress={dialogState.onKeepMine}>
                    Keep My Changes
                  </Button>
                  <Button
                    className='bg-danger text-white'
                    onPress={dialogState.onKeepExternal}
                  >
                    Accept External Changes
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

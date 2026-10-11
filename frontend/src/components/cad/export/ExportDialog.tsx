import { Button, Modal } from '@heroui/react'
import { Download04Icon } from '@hugeicons/core-free-icons'
import type * as React from 'react'

import { Icon } from '@/components/icons/HugeIcon'
import type { LogEntry } from '@/types'

import type { ExportFormat } from './ExportFormatList'
import { ExportFormatList } from './ExportFormatList'
import { ExportLogPanel } from './ExportLogPanel'
import type { ExportPhase } from './ExportStatus'
import { ExportSpinner, ExportStatusLine } from './ExportStatus'

/**
 * The export dialog every kernel shares. Each kernel owns how a file gets
 * written; this owns how choosing, running, and saving one looks.
 *
 * The form never leaves the screen. Picking another format after a run is how
 * you export again, so the dialog drops back to idle when the format changes.
 */
export function ExportDialog({
  isOpen,
  onClose,
  projectName,
  kernel,
  note,
  formats,
  format,
  onFormatChange,
  options,
  filename,
  phase,
  size,
  fileCount,
  error,
  logs,
  onExport,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  projectName: string
  kernel: string
  /** A short qualifier after the kernel name in the header. */
  note?: string
  formats: ExportFormat[]
  format: string
  onFormatChange: (id: string) => void
  /** Settings for the selected format, shown under the list. */
  options?: { title: string; content: React.ReactNode }
  filename: string
  phase: ExportPhase
  size?: number
  fileCount?: number
  error?: string
  logs: LogEntry[]
  onExport: () => void
  onSave: () => void
}) {
  const isBusy = phase === 'exporting'
  const isDone = phase === 'success' || phase === 'error'

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => !open && onClose()}
      >
        <Modal.Container>
          <Modal.Dialog className='max-h-[85vh] max-w-lg'>
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className='flex min-w-0 flex-col gap-0.5'>
                <h3 className='text-base font-semibold text-foreground'>
                  Export
                </h3>
                <p className='truncate text-xs text-muted'>
                  <span className='text-foreground'>{projectName}</span>
                  {` · ${kernel}`}
                  {note && ` · ${note}`}
                </p>
              </div>
            </Modal.Header>

            <Modal.Body>
              <div className='flex flex-col gap-4 py-1'>
                <ExportFormatList
                  formats={formats}
                  selected={format}
                  onSelect={onFormatChange}
                  isDisabled={isBusy}
                />

                {options && (
                  <div className='flex flex-col gap-1.5'>
                    <div className='text-xs font-medium text-muted'>
                      {options.title}
                    </div>
                    <div className='flex flex-col gap-3 rounded-md border border-border px-3 py-2.5'>
                      {options.content}
                    </div>
                  </div>
                )}

                <ExportStatusLine
                  phase={phase}
                  filename={filename}
                  size={size}
                  fileCount={fileCount}
                  error={error}
                />

                {(isBusy || logs.length > 0) && <ExportLogPanel logs={logs} />}
              </div>
            </Modal.Body>

            <Modal.Footer>
              <div className='flex w-full flex-wrap items-center gap-x-4 gap-y-2'>
                <div className='mr-auto flex min-w-0 items-baseline gap-2 text-xs'>
                  <span className='shrink-0 text-muted'>File</span>
                  <span className='truncate font-mono text-foreground'>
                    {filename}
                  </span>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <Button variant='outline' onPress={onClose}>
                    {isDone ? 'Close' : 'Cancel'}
                  </Button>
                  {phase === 'idle' && (
                    <Button variant='primary' onPress={onExport}>
                      Export
                    </Button>
                  )}
                  {phase === 'exporting' && (
                    <Button variant='primary' isDisabled>
                      <ExportSpinner />
                      Exporting…
                    </Button>
                  )}
                  {phase === 'success' && (
                    <Button variant='primary' onPress={onSave}>
                      <Icon icon={Download04Icon} size={16} />
                      Save File
                    </Button>
                  )}
                  {phase === 'error' && (
                    <Button variant='primary' onPress={onExport}>
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

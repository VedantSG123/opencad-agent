import { Button, Modal } from '@heroui/react'
import { Download04Icon } from '@hugeicons/core-free-icons'
import * as React from 'react'
import type { Build123dExportFormat } from 'shared/build123d'
import { BUILD123D_EXPORT_EXTENSIONS } from 'shared/build123d'
import { toast } from 'sonner'

import type { ExportFormatCard } from '@/components/cad/export/ExportFormatGrid'
import { ExportFormatGrid } from '@/components/cad/export/ExportFormatGrid'
import { ExportLogPanel } from '@/components/cad/export/ExportLogPanel'
import {
  ExportFailure,
  ExportProgress,
  ExportSpinner,
  ExportSuccess,
} from '@/components/cad/export/ExportStatus'
import { Icon } from '@/components/icons/HugeIcon'
import { kernelFilesStore } from '@/hooks/useKernelFiles'
import { joinPaths } from '@/lib/utils'
import type { LogEntry } from '@/types'
import type { Project } from '@/types/project'

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

const FORMAT_CARDS: ExportFormatCard[] = [
  {
    id: 'step',
    label: 'STEP',
    ext: 'step',
    description:
      'Exact CAD geometry, keeping colours and the assembly tree. What to send a machinist or another CAD package.',
  },
  {
    id: 'stl',
    label: 'STL (binary)',
    ext: 'stl',
    description:
      'The 3D printing standard. A compact triangle mesh, with no colour.',
  },
  {
    id: 'stl-ascii',
    label: 'STL (ascii)',
    ext: 'stl',
    description:
      'The same mesh as readable text. Several times larger than binary STL.',
  },
  {
    id: '3mf',
    label: '3MF',
    ext: '3mf',
    description:
      'Modern printing format carrying colour and materials, at a fraction of the size of STL.',
  },
  {
    id: 'glb',
    label: 'glTF (binary)',
    ext: 'glb',
    description: 'For the web, AR and preview tools. Includes UV coordinates.',
  },
]

/** The script's own output, as log lines with a level the panel can colour. */
function toLogs(output: string, start: number): LogEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      type: /^(error|traceback)/i.test(text)
        ? ('error' as const)
        : /^warn/i.test(text)
          ? ('warn' as const)
          : ('log' as const),
      text,
      timestamp: start + index,
    }))
}

interface Build123dExportDialogProps {
  isOpen: boolean
  onClose: () => void
  project: Project
}

export function Build123dExportDialog({
  isOpen,
  onClose,
  project,
}: Build123dExportDialogProps) {
  const [format, setFormat] = React.useState<Build123dExportFormat>('step')
  const [status, setStatus] = React.useState<ExportStatus>('idle')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [exported, setExported] = React.useState<Blob | null>(null)

  React.useEffect(() => {
    if (isOpen) {
      setStatus('idle')
      setErrorMessage('')
      setLogs([])
      setExported(null)
    }
  }, [isOpen])

  const extension = BUILD123D_EXPORT_EXTENSIONS[format]

  const fail = (message: string, lines: LogEntry[] = []) => {
    setStatus('error')
    setErrorMessage(message)
    setLogs((previous) => [...previous, ...lines])
    toast.error('Export failed')
  }

  const handleStartExport = async () => {
    if (!project.file) {
      toast.error('No main file set for this project.')
      return
    }

    setStatus('exporting')
    setErrorMessage('')
    setLogs([])
    setExported(null)

    // The same unsaved buffers the viewport builds from, so the file matches
    // what is on screen rather than what was last written to disk.
    const overrides: Record<string, string> = {}
    for (const [virtualPath, file] of Object.entries(
      kernelFilesStore.getState().files,
    )) {
      if (virtualPath.toLowerCase().endsWith('.py')) {
        overrides[joinPaths(project.directory, virtualPath)] = file.content
      }
    }

    const response = await window.electron?.exportBuild123d({
      mainPath: project.file,
      projectDirectory: project.directory,
      overrides,
      format,
    })

    if (!response) {
      fail('Exporting needs the desktop app.')
      return
    }
    if (!response.success) {
      fail(response.error.message)
      return
    }

    const result = response.data
    const now = Date.now()
    const scriptLogs = toLogs(result.logs, now)

    if (!result.ok) {
      setLogs(scriptLogs)
      fail(result.error, toLogs(result.error, now + scriptLogs.length))
      return
    }

    setLogs([
      ...scriptLogs,
      {
        type: 'info',
        text: `Wrote ${result.data.length.toLocaleString()} bytes of ${extension} in ${result.duration}s`,
        timestamp: now + scriptLogs.length,
      },
    ])
    setExported(new Blob([result.data as BlobPart]))
    setStatus('success')
    toast.success('Export completed successfully!')
  }

  const handleSaveToDevice = () => {
    if (!exported) {
      return
    }

    const base = project.name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'model'
    const filename = `${base}.${extension}`

    const url = URL.createObjectURL(exported)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    toast.success(`Saved ${filename}`)
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => !open && onClose()}
      >
        <Modal.Container>
          <Modal.Dialog className='max-h-[80vh] max-w-xl'>
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className='flex flex-col gap-1'>
                <h3 className='text-xl font-bold text-foreground'>
                  Export build123d Model
                </h3>
                <p className='text-sm font-normal text-foreground/60'>
                  Runs the script and writes the model it shows, including any
                  unsaved edits.
                </p>
              </div>
            </Modal.Header>

            <Modal.Body>
              {status === 'idle' && (
                <ExportFormatGrid
                  formats={FORMAT_CARDS}
                  selected={format}
                  onSelect={(id) => setFormat(id as Build123dExportFormat)}
                />
              )}

              {status === 'exporting' && (
                <ExportProgress
                  title='Running the script…'
                  detail={
                    <>
                      build123d is writing{' '}
                      <span className='font-mono font-bold text-foreground'>
                        {extension}
                      </span>
                    </>
                  }
                />
              )}

              {status === 'success' && (
                <ExportSuccess
                  detail={
                    <>
                      Wrote{' '}
                      <span className='font-mono font-bold text-foreground'>
                        {extension}
                      </span>
                      {exported
                        ? ` — ${exported.size.toLocaleString()} bytes.`
                        : '.'}
                    </>
                  }
                />
              )}

              {status === 'error' && <ExportFailure message={errorMessage} />}

              {(status === 'exporting' ||
                status === 'error' ||
                logs.length > 0) && <ExportLogPanel logs={logs} />}
            </Modal.Body>

            <Modal.Footer>
              {status === 'idle' && (
                <div className='flex items-center gap-2'>
                  <Button variant='outline' onPress={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant='primary'
                    onPress={() => void handleStartExport()}
                  >
                    Start Export
                  </Button>
                </div>
              )}

              {status === 'exporting' && (
                <Button
                  isDisabled
                  className='bg-default text-default-foreground'
                >
                  <ExportSpinner size={16} />
                  Exporting…
                </Button>
              )}

              {status === 'success' && (
                <div className='flex items-center gap-2'>
                  <Button variant='outline' onPress={onClose}>
                    Close
                  </Button>
                  <Button variant='primary' onPress={handleSaveToDevice}>
                    <Icon icon={Download04Icon} size={16} />
                    Save to Device
                  </Button>
                </div>
              )}

              {status === 'error' && (
                <div className='flex items-center gap-2'>
                  <Button variant='outline' onPress={onClose}>
                    Close
                  </Button>
                  <Button variant='primary' onPress={() => setStatus('idle')}>
                    Try Again
                  </Button>
                </div>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

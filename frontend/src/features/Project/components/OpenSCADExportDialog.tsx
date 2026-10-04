import { Button, Modal } from '@heroui/react'
import { Download04Icon } from '@hugeicons/core-free-icons'
import * as React from 'react'
import { toast } from 'sonner'

import type { ExportFormatCard } from '@/components/cad/export/ExportFormatGrid'
import { ExportFormatGrid } from '@/components/cad/export/ExportFormatGrid'
import { ExportLogPanel } from '@/components/cad/export/ExportLogPanel'
import {
  ExportFailure,
  ExportSpinner,
  ExportSuccess,
} from '@/components/cad/export/ExportStatus'
import { Icon } from '@/components/icons/HugeIcon'
import { classifyOpenScadLog, useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import type { CompileResult } from '@/kernels/openscad/nodeOpenSCADApi'
import type { LogEntry } from '@/types'
import type { Project } from '@/types/project'

interface OpenSCADExportDialogProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  result: CompileResult | null
  mainFilePath: string | null
  mainFileContent: string | undefined
}

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

export function OpenSCADExportDialog({
  isOpen,
  onClose,
  project,
  result,
  mainFilePath,
  mainFileContent,
}: OpenSCADExportDialogProps) {
  const is2DDrawing = React.useMemo(() => {
    return result?.format === 'svg'
  }, [result])

  const [format, setFormat] = React.useState<string>(
    is2DDrawing ? 'svg' : 'binstl',
  )
  const [status, setStatus] = React.useState<ExportStatus>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string>('')
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [exportedBlob, setExportedBlob] = React.useState<Blob | null>(null)

  const store = useNodeOpenSCAD((state) => state)

  const handleStartExport = async () => {
    if (!mainFilePath || !mainFileContent) {
      toast.error('No source file active to export.')
      return
    }

    setStatus('exporting')
    setErrorMessage('')
    setLogs([])
    setExportedBlob(null)

    try {
      const exportRes = await store.export(
        { path: mainFilePath, code: mainFileContent },
        format,
        project.directory,
      )

      const exportLogs: LogEntry[] = []
      const now = Date.now()
      let index = 0

      if (exportRes?.stdout) {
        exportRes.stdout.forEach((text) => {
          text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
              exportLogs.push({
                type: 'log',
                text: line,
                timestamp: now + index++,
              })
            })
        })
      }

      if (exportRes?.stderr) {
        exportRes.stderr.forEach((text) => {
          text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
              exportLogs.push(classifyOpenScadLog(line, now + index++))
            })
        })
      }

      setLogs(exportLogs)

      if (!exportRes || exportRes.error) {
        setStatus('error')
        setErrorMessage(
          exportRes?.stderr.join('\n') ||
            'An unknown error occurred during OpenSCAD export.',
        )
        toast.error('Export failed')
      } else {
        setExportedBlob(exportRes.blob)
        setStatus('success')
        toast.success('Export completed successfully!')
      }
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
      toast.error('Export failed')
    }
  }

  const handleSaveToDevice = () => {
    if (!exportedBlob) return

    try {
      const isStl = format === 'binstl' || format === 'asciistl'
      const fileExt = isStl ? 'stl' : format.toLowerCase()
      const baseProjectName = project.name.replace(/[^a-zA-Z0-9-_]/g, '_')
      const filename = `${baseProjectName || 'model'}.${fileExt}`

      const url = URL.createObjectURL(exportedBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Saved ${filename}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save file: ${msg}`)
    }
  }

  const formatCards: ExportFormatCard[] = is2DDrawing
    ? [
        {
          id: 'svg',
          label: 'SVG Drawing',
          ext: '.svg',
          description: 'Scalable Vector Graphics 2D vector drawing.',
        },
        {
          id: 'dxf',
          label: 'DXF Drawing',
          ext: '.dxf',
          description: 'AutoCAD DXF format, widely used in CNC/laser cutting.',
        },
        {
          id: 'pdf',
          label: 'PDF Document',
          ext: '.pdf',
          description: 'Portable Document Format vector drawing.',
        },
      ]
    : [
        {
          id: 'binstl',
          label: 'STL (binary)',
          ext: '.stl',
          description:
            'Standard 3D mesh (compact binary format). Recommended for most uses.',
        },
        {
          id: 'asciistl',
          label: 'STL (ascii)',
          ext: '.stl',
          description:
            'Standard 3D mesh (human-readable ASCII format). Larger than binary STL.',
        },
        {
          id: '3mf',
          label: '3MF',
          ext: '.3mf',
          description: 'Modern 3D manufacturing format with rich metadata.',
        },
        {
          id: 'amf',
          label: 'AMF',
          ext: '.amf',
          description:
            'Additive manufacturing XML format preserving color & materials.',
        },
        {
          id: 'off',
          label: 'OFF',
          ext: '.off',
          description: 'Object File Format, simple mesh representation.',
        },
        {
          id: 'csg',
          label: 'CSG',
          ext: '.csg',
          description:
            'Constructive Solid Geometry syntax tree representation.',
        },
      ]

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => !open && onClose()}
      >
        <Modal.Container>
          <Modal.Dialog className='max-w-xl max-h-[80vh]'>
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className='flex flex-col gap-1'>
                <h3 className='text-xl font-bold text-foreground'>
                  Export OpenSCAD Model
                </h3>
                <p className='text-sm font-normal text-foreground/60'>
                  Export the current OpenSCAD viewport designs into standard
                  CAD, mesh, and vector formats.
                </p>
              </div>
            </Modal.Header>
            <Modal.Body>
              {/* State: Format Selection (Idle) */}
              {status === 'idle' && (
                <div className='flex flex-col gap-5 py-2'>
                  <ExportFormatGrid
                    formats={formatCards}
                    selected={format}
                    onSelect={setFormat}
                  />
                </div>
              )}

              {/* State: Exporting (Loading) */}
              {status === 'exporting' && (
                <div className='flex flex-col items-center justify-center py-6 gap-4'>
                  <ExportSpinner />
                  <div className='text-center'>
                    <div className='font-semibold text-sm'>
                      Compiling CAD geometries...
                    </div>
                    <div className='text-xs text-foreground/60 mt-1'>
                      Spawning OpenSCAD native compiler worker to format model
                      into{' '}
                      <span className='font-mono font-bold text-foreground'>
                        {format === 'binstl' || format === 'asciistl'
                          ? 'stl'
                          : format}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* State: Success (Ready to download) */}
              {status === 'success' && (
                <ExportSuccess
                  detail={
                    <>
                      Successfully compiled design into{' '}
                      <span className='font-mono font-bold text-foreground'>
                        {format === 'binstl' || format === 'asciistl'
                          ? 'stl'
                          : format}
                      </span>
                      .
                    </>
                  }
                />
              )}

              {/* State: Error (Failed) */}
              {status === 'error' && <ExportFailure message={errorMessage} />}

              {/* Console Log Terminal (Visible in exporting, error, or optionally success states) */}
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
                  <Button variant='primary' onPress={handleStartExport}>
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
                  Exporting...
                </Button>
              )}

              {status === 'success' && (
                <div className='flex items-center gap-2'>
                  <Button variant='outline' onPress={() => setStatus('idle')}>
                    Export Different Format
                  </Button>
                  <Button
                    onPress={handleSaveToDevice}
                    className='bg-success text-success-foreground'
                  >
                    <Icon icon={Download04Icon} size={16} className='mr-1.5' />
                    Save to Device
                  </Button>
                </div>
              )}

              {status === 'error' && (
                <div className='flex items-center gap-2'>
                  <Button variant='outline' onPress={() => setStatus('idle')}>
                    Back to Settings
                  </Button>
                  <Button variant='danger' onPress={handleStartExport}>
                    Retry Export
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

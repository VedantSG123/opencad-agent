import { Button, Modal } from '@heroui/react'
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Download04Icon,
  Loading02Icon,
  TerminalIcon,
} from '@hugeicons/core-free-icons'
import * as React from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import { classifyOpenScadLog, useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import type { CompileResult } from '@/kernels/openscad/nodeOpenSCADApi'
import { cn } from '@/lib/utils'
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

interface LogLine {
  type: 'log' | 'info' | 'warn' | 'error'
  text: string
  timestamp: number
}

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
  const [logs, setLogs] = React.useState<LogLine[]>([])
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

      const exportLogs: LogLine[] = []
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

  const formatCards = is2DDrawing
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
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                    {formatCards.map((card) => {
                      const isActive = format === card.id
                      return (
                        <button
                          key={card.id}
                          onClick={() => setFormat(card.id)}
                          className={cn(
                            'flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer outline-hidden select-none hover:scale-[1.01]',
                            isActive
                              ? 'border-accent bg-accent/5 text-foreground'
                              : 'border-border/60 hover:border-foreground/30 text-foreground/60 hover:text-foreground bg-muted/10',
                          )}
                        >
                          <div className='flex items-center justify-between w-full mb-1'>
                            <span className='font-bold text-sm text-foreground'>
                              {card.label}
                            </span>
                            <span className='text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-muted/20 border border-border/50 text-foreground/60'>
                              {card.ext}
                            </span>
                          </div>
                          <span className='text-xs text-foreground/60 leading-relaxed'>
                            {card.description}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* State: Exporting (Loading) */}
              {status === 'exporting' && (
                <div className='flex flex-col items-center justify-center py-6 gap-4'>
                  <Icon
                    icon={Loading02Icon}
                    size={40}
                    className='text-foreground/70 animate-spin'
                  />
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
                <div className='flex flex-col items-center justify-center py-6 gap-4'>
                  <div className='relative'>
                    <Icon
                      icon={CheckmarkCircle02Icon}
                      size={48}
                      className='text-success animate-in zoom-in-50 duration-300'
                    />
                    <div className='absolute -inset-0.5 rounded-full bg-success/20 animate-ping duration-1000' />
                  </div>
                  <div className='text-center'>
                    <div className='font-bold text-base text-foreground'>
                      Export Complete!
                    </div>
                    <div className='text-xs text-foreground/60 mt-1'>
                      Successfully compiled design into{' '}
                      <span className='font-mono font-bold text-foreground'>
                        {format === 'binstl' || format === 'asciistl'
                          ? 'stl'
                          : format}
                      </span>
                      .
                    </div>
                  </div>
                </div>
              )}

              {/* State: Error (Failed) */}
              {status === 'error' && (
                <div className='flex flex-col gap-4 py-2'>
                  <div className='flex items-start gap-3 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger'>
                    <Icon
                      icon={Alert02Icon}
                      size={20}
                      className='shrink-0 mt-0.5'
                    />
                    <div className='flex flex-col gap-1 text-xs'>
                      <span className='font-bold'>Export Failed</span>
                      <span className='leading-relaxed'>{errorMessage}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Console Log Terminal (Visible in exporting, error, or optionally success states) */}
              {(status === 'exporting' ||
                status === 'error' ||
                logs.length > 0) && (
                <div className='bg-zinc-950 dark:bg-black rounded-lg border border-border/80 p-3 font-mono text-[10px] text-zinc-300 mt-2 shadow-inner'>
                  <div className='text-zinc-500 border-b border-zinc-900 pb-1.5 mb-2 flex items-center gap-1.5 select-none'>
                    <Icon
                      icon={TerminalIcon}
                      size={14}
                      className='text-zinc-400'
                    />
                    <span className='font-semibold'>Export Output Logs</span>
                  </div>
                  <div className='h-28 pr-3 overflow-y-auto'>
                    {logs.length === 0 ? (
                      <div className='text-zinc-600 italic'>
                        No logs generated.
                      </div>
                    ) : (
                      <div className='flex flex-col gap-1'>
                        {logs.map((log, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              'whitespace-pre-wrap leading-relaxed',
                              log.type === 'error' && 'text-red-400 font-bold',
                              log.type === 'warn' && 'text-yellow-400',
                              log.type === 'info' && 'text-blue-400',
                            )}
                          >
                            <span className='text-zinc-600 mr-1.5 select-none'>
                              [{new Date(log.timestamp).toLocaleTimeString()}]
                            </span>
                            {log.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                  <Icon
                    icon={Loading02Icon}
                    size={16}
                    className='animate-spin mr-2'
                  />
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

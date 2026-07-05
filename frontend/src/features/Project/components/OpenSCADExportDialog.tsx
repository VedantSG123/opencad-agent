import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Terminal,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-xl max-h-[85vh] overflow-y-auto border border-border bg-background shadow-2xl rounded-xl transition-all duration-300'>
        <DialogHeader>
          <DialogTitle className='text-xl font-bold bg-linear-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent'>
            Export OpenSCAD Model
          </DialogTitle>
          <DialogDescription>
            Export the current OpenSCAD viewport designs into standard CAD,
            mesh, and vector formats.
          </DialogDescription>
        </DialogHeader>

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
                        ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 text-foreground ring-2 ring-blue-500/20'
                        : 'border-border/60 hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground bg-accent/20',
                    )}
                  >
                    <div className='flex items-center justify-between w-full mb-1'>
                      <span className='font-bold text-sm text-foreground'>
                        {card.label}
                      </span>
                      <span className='text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-accent border border-border/50 text-muted-foreground'>
                        {card.ext}
                      </span>
                    </div>
                    <span className='text-xs text-muted-foreground leading-relaxed'>
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
            <Loader2 className='h-10 w-10 text-blue-500 animate-spin' />
            <div className='text-center'>
              <div className='font-semibold text-sm'>
                Compiling CAD geometries...
              </div>
              <div className='text-xs text-muted-foreground mt-1'>
                Spawning OpenSCAD native compiler worker to format model into{' '}
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
              <CheckCircle2 className='h-12 w-12 text-green-500 animate-in zoom-in-50 duration-300' />
              <div className='absolute -inset-0.5 rounded-full bg-green-500/20 animate-ping duration-1000' />
            </div>
            <div className='text-center'>
              <div className='font-bold text-base text-foreground'>
                Export Complete!
              </div>
              <div className='text-xs text-muted-foreground mt-1'>
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
            <div className='flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive'>
              <AlertTriangle className='h-5 w-5 shrink-0 mt-0.5' />
              <div className='flex flex-col gap-1 text-xs'>
                <span className='font-bold'>Export Failed</span>
                <span className='leading-relaxed'>{errorMessage}</span>
              </div>
            </div>
          </div>
        )}

        {/* Console Log Terminal (Visible in exporting, error, or optionally success states) */}
        {(status === 'exporting' || status === 'error' || logs.length > 0) && (
          <div className='bg-zinc-950 dark:bg-black rounded-lg border border-border/80 p-3 font-mono text-[10px] text-zinc-300 mt-2 shadow-inner'>
            <div className='text-zinc-500 border-b border-zinc-900 pb-1.5 mb-2 flex items-center gap-1.5 select-none'>
              <Terminal className='h-3.5 w-3.5 text-zinc-400' />
              <span className='font-semibold'>Export Output Logs</span>
            </div>
            <ScrollArea className='h-28 pr-3'>
              {logs.length === 0 ? (
                <div className='text-zinc-600 italic'>No logs generated.</div>
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
            </ScrollArea>
          </div>
        )}

        <DialogFooter className='border-t border-border/40 pt-4 flex flex-row items-center justify-end'>
          {status === 'idle' && (
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={onClose}
                className='cursor-pointer'
              >
                Cancel
              </Button>
              <Button
                onClick={handleStartExport}
                className='bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white cursor-pointer transition-all duration-200'
              >
                Start Export
              </Button>
            </div>
          )}

          {status === 'exporting' && (
            <Button disabled className='bg-muted text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin mr-2' />
              Exporting...
            </Button>
          )}

          {status === 'success' && (
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => setStatus('idle')}
                className='cursor-pointer'
              >
                Export Different Format
              </Button>
              <Button
                onClick={handleSaveToDevice}
                className='bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-all duration-200 flex items-center gap-1.5'
              >
                <Download className='h-4 w-4' />
                Save to Device
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => setStatus('idle')}
                className='cursor-pointer'
              >
                Back to Settings
              </Button>
              <Button
                onClick={handleStartExport}
                className='bg-destructive hover:bg-destructive/90 text-white cursor-pointer transition-all duration-200'
              >
                Retry Export
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

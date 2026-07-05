import { zipSync } from 'fflate'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Settings,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getBuilderApi } from '@/kernels/replicad/builderApi'
import { cn } from '@/lib/utils'
import type {
  ExportFileTypes,
  MeshRenderOutput,
  SvgRenderOutput,
} from '@/types'
import type { Project } from '@/types/project'

interface ReplicadExportDialogProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  shapes?: (MeshRenderOutput | SvgRenderOutput)[] | null
}

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

interface LogLine {
  type: 'log' | 'info' | 'warn' | 'error'
  text: string
  timestamp: number
}

export function ReplicadExportDialog({
  isOpen,
  onClose,
  project,
  shapes,
}: ReplicadExportDialogProps) {
  const isSvgOnly = React.useMemo(() => {
    return !!(shapes?.length && shapes.every((s) => s.format === 'svg'))
  }, [shapes])

  const [format, setFormat] = React.useState<ExportFileTypes | 'svg'>(
    isSvgOnly ? 'svg' : 'stl-binary',
  )
  const [status, setStatus] = React.useState<ExportStatus>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string>('')
  const [logs, setLogs] = React.useState<LogLine[]>([])
  const [exportedFiles, setExportedFiles] = React.useState<
    Array<{ blob: Blob; name: string }>
  >([])

  // Advanced configurations for STL/mesh models
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [tolerance, setTolerance] = React.useState<number>(0.01)
  const [angularTolerance, setAngularTolerance] = React.useState<number>(30)

  const handleStartExport = async () => {
    setStatus('exporting')
    setErrorMessage('')
    setLogs([])

    try {
      if (format === 'svg') {
        // Wait 300ms for a smooth visual loading transition
        await new Promise((resolve) => setTimeout(resolve, 300))

        if (!shapes || shapes.length === 0) {
          throw new Error('No drawings found to export.')
        }

        const svgShapes = shapes.filter(
          (s): s is SvgRenderOutput => s.format === 'svg',
        )
        if (svgShapes.length === 0) {
          throw new Error('No SVG drawings found in project.')
        }

        // Parse and merge viewboxes
        const parseViewbox = (viewboxString: string) => {
          const [xStart, yStart, width, height] = viewboxString
            .split(/[\s,]+/)
            .map((v) => parseFloat(v))
          return { xStart, yStart, width, height }
        }

        const parsed = svgShapes.map((s) => parseViewbox(s.viewbox))
        const minX = Math.min(...parsed.map((v) => v.xStart))
        const minY = Math.min(...parsed.map((v) => v.yStart))
        const maxX = Math.max(...parsed.map((v) => v.xStart + v.width))
        const maxY = Math.max(...parsed.map((v) => v.yStart + v.height))
        const mergedViewbox = {
          xStart: minX,
          yStart: minY,
          width: maxX - minX,
          height: maxY - minY,
        }

        const viewboxStr = `${mergedViewbox.xStart} ${mergedViewbox.yStart} ${mergedViewbox.width} ${mergedViewbox.height}`

        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewboxStr}">\n`
        svgShapes.forEach((s) => {
          const pathData = Array.isArray(s.paths)
            ? s.paths.flat(Infinity).join(' ')
            : String(s.paths)
          let strokeDash = ''
          if (s.strokeType === 'dots') strokeDash = ' stroke-dasharray="1, 2"'
          else if (s.strokeType === 'dashes')
            strokeDash = ' stroke-dasharray="5, 5"'

          const color = s.color || '#ffffff'
          svgContent += `  <path d="${pathData}" stroke="${color}" fill="none"${strokeDash} vector-effect="non-scaling-stroke" />\n`
        })
        svgContent += `</svg>`

        const blob = new Blob([svgContent], { type: 'image/svg+xml' })
        setExportedFiles([{ blob, name: project.name || 'drawing' }])
        setStatus('success')
        toast.success('Export completed successfully!')
        return
      }

      const builderApi = getBuilderApi()
      const isStl = format.startsWith('stl')

      const result = await builderApi.exportToFile(
        format,
        'default_shapes',
        isStl
          ? {
              tolerance: Number(tolerance) || 0.01,
              angularTolerance: Number(angularTolerance) || 30,
            }
          : undefined,
      )

      if (result.logs) {
        setLogs(result.logs)
      }

      if (result.error) {
        setStatus('error')
        setErrorMessage(
          result.message || 'An unknown error occurred during export.',
        )
        toast.error('Export failed')
      } else {
        setExportedFiles(result.files)
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

  const handleSaveToDevice = async () => {
    if (exportedFiles.length === 0) return

    try {
      const isStl = format.startsWith('stl')
      const isSvg = format === 'svg'
      const extension = isSvg ? 'svg' : isStl ? 'stl' : 'step'
      const baseProjectName = project.name.replace(/[^a-zA-Z0-9-_]/g, '_')

      if (exportedFiles.length === 1) {
        // Save single file
        const file = exportedFiles[0]
        const blob = file.blob
        const filename = `${baseProjectName || file.name || 'model'}.${extension}`

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`Saved ${filename}`)
      } else {
        // Zip package multiple files
        toast.info('Zipping files...')
        const zipData: Record<string, Uint8Array> = {}

        for (let i = 0; i < exportedFiles.length; i++) {
          const file = exportedFiles[i]
          const arrayBuffer = await file.blob.arrayBuffer()
          const safeName = (file.name || `shape_${i + 1}`).replace(
            /[^a-zA-Z0-9-_]/g,
            '_',
          )
          const filename = `${safeName}.${extension}`
          zipData[filename] = new Uint8Array(arrayBuffer)
        }

        const zippedBytes = zipSync(zipData)
        const zipBlob = new Blob([zippedBytes], { type: 'application/zip' })
        const zipFilename = `${baseProjectName || 'model'}_export.zip`

        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = zipFilename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`Saved archive ${zipFilename}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save files: ${msg}`)
    }
  }

  const formatCards: {
    id: ExportFileTypes | 'svg'
    label: string
    ext: string
    description: string
  }[] = isSvgOnly
    ? [
        {
          id: 'svg',
          label: 'SVG Drawing',
          ext: '.svg',
          description:
            'Scalable Vector Graphics 2D format. Perfect for 2D sketches and drawings.',
        },
      ]
    : [
        {
          id: 'stl-binary',
          label: 'STL (binary)',
          ext: '.stl',
          description:
            'Standard 3D mesh (compact binary format). Recommended for most uses.',
        },
        {
          id: 'stl',
          label: 'STL (ascii)',
          ext: '.stl',
          description:
            'Standard 3D mesh (human-readable ASCII format). Larger than binary STL.',
        },
        {
          id: 'step',
          label: 'STEP',
          ext: '.step',
          description:
            'Standard CAD exchange format using boundary representation (B-Rep).',
        },
        {
          id: 'step-assembly',
          label: 'STEP (assembly)',
          ext: '.step',
          description:
            'STEP assembly preserving part hierarchy, names, and colors.',
        },
      ]

  const isStlFormat = format.startsWith('stl')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-xl max-h-[85vh] overflow-y-auto border border-border bg-background shadow-2xl rounded-xl transition-all duration-300'>
        <DialogHeader>
          <DialogTitle className='text-xl font-bold bg-linear-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent'>
            Export CAD Model
          </DialogTitle>
          <DialogDescription>
            Export the current Replicad viewport models into standard CAD and
            mesh formats.
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
                      'flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer outline-hidden select-none',
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

            {/* Advanced Settings for STL tolerance */}
            {isStlFormat && (
              <div className='pt-3'>
                <button
                  type='button'
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className='flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none'
                >
                  <Settings className='h-3.5 w-3.5' />
                  <span>Advanced Mesh Parameters</span>
                </button>

                {showAdvanced && (
                  <div className='grid grid-cols-2 gap-4 mt-3 p-3 rounded-lg bg-accent/30 border border-border/40 animate-in fade-in slide-in-from-top-1 duration-200'>
                    <div className='flex flex-col gap-1.5'>
                      <Label
                        htmlFor='tolerance'
                        className='text-xs font-medium'
                      >
                        Linear Tolerance
                      </Label>
                      <Input
                        id='tolerance'
                        type='number'
                        step='0.001'
                        min='0.001'
                        value={tolerance}
                        onChange={(e) =>
                          setTolerance(parseFloat(e.target.value))
                        }
                        className='h-8 text-xs'
                      />
                      <span className='text-[10px] text-muted-foreground'>
                        Lower is finer/higher triangles (default 0.01)
                      </span>
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <Label
                        htmlFor='angularTolerance'
                        className='text-xs font-medium'
                      >
                        Angular Tolerance
                      </Label>
                      <Input
                        id='angularTolerance'
                        type='number'
                        step='1'
                        min='1'
                        max='90'
                        value={angularTolerance}
                        onChange={(e) =>
                          setAngularTolerance(parseInt(e.target.value))
                        }
                        className='h-8 text-xs'
                      />
                      <span className='text-[10px] text-muted-foreground'>
                        Max angle deflection in degrees (default 30)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
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
                Using Replicad and OpenCascade kernel to format shapes into{' '}
                <span className='font-mono font-bold text-foreground'>
                  {format}
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
                Successfully compiled{' '}
                <span className='font-semibold text-foreground'>
                  {exportedFiles.length}
                </span>{' '}
                shape(s) into{' '}
                <span className='font-mono font-bold text-foreground'>
                  {format}
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
          <div className='bg-zinc-950 dark:bg-black rounded-lg border border-border/80 p-3 font-mono text-[10px] text-zinc-300 max-h-40 overflow-y-auto mt-2 shadow-inner'>
            <div className='text-zinc-500 border-b border-zinc-900 pb-1.5 mb-2 flex items-center gap-1.5 select-none'>
              <Terminal className='h-3.5 w-3.5 text-zinc-400' />
              <span className='font-semibold'>Export Output Logs</span>
            </div>
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

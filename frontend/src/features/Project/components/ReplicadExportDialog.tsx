import { Button, Description, Label, Modal, NumberField } from '@heroui/react'
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Download04Icon,
  Loading02Icon,
  Settings01Icon,
  TerminalIcon,
} from '@hugeicons/core-free-icons'
import { zipSync } from 'fflate'
import * as React from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
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
                  Export CAD Model
                </h3>
                <p className='text-sm font-normal text-foreground/60'>
                  Export the current Replicad viewport models into standard CAD
                  and mesh formats.
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
                            'flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer outline-hidden select-none',
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

                  {/* Advanced Settings for STL tolerance */}
                  {isStlFormat && (
                    <div className='pt-3'>
                      <button
                        type='button'
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className='flex items-center gap-1.5 text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors cursor-pointer select-none'
                      >
                        <Icon icon={Settings01Icon} size={14} />
                        <span>Advanced Mesh Parameters</span>
                      </button>

                      {showAdvanced && (
                        <div className='grid grid-cols-2 gap-4 mt-3 p-3 rounded-lg bg-muted/10 border border-border/40 animate-in fade-in slide-in-from-top-1 duration-200'>
                          <NumberField
                            value={tolerance}
                            onChange={(value) => setTolerance(value ?? 0.01)}
                            minValue={0.001}
                            step={0.001}
                          >
                            <Label className='text-sm font-semibold'>
                              Linear Tolerance
                            </Label>
                            <NumberField.Group>
                              <NumberField.DecrementButton />
                              <NumberField.Input />
                              <NumberField.IncrementButton />
                            </NumberField.Group>
                            <Description className='text-xs text-foreground/60'>
                              Lower is finer/higher triangles (default 0.01)
                            </Description>
                          </NumberField>
                          <NumberField
                            value={angularTolerance}
                            onChange={(value) =>
                              setAngularTolerance(value ?? 30)
                            }
                            minValue={1}
                            maxValue={90}
                            step={1}
                          >
                            <Label className='text-sm font-semibold'>
                              Angular Tolerance
                            </Label>
                            <NumberField.Group>
                              <NumberField.DecrementButton />
                              <NumberField.Input />
                              <NumberField.IncrementButton />
                            </NumberField.Group>
                            <Description className='text-xs text-foreground/60'>
                              Max angle deflection in degrees (default 30)
                            </Description>
                          </NumberField>
                        </div>
                      )}
                    </div>
                  )}
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
                      Using Replicad and OpenCascade kernel to format shapes
                      into{' '}
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

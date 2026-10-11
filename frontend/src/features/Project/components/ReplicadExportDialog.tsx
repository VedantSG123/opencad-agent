import { Description, Label, NumberField } from '@heroui/react'
import { zipSync } from 'fflate'
import * as React from 'react'
import { toast } from 'sonner'

import { ExportDialog } from '@/components/cad/export/ExportDialog'
import type { ExportFormat } from '@/components/cad/export/ExportFormatList'
import type { ExportPhase } from '@/components/cad/export/ExportStatus'
import { getBuilderApi } from '@/kernels/replicad/builderApi'
import type {
  ExportFileTypes,
  MeshRenderOutput,
  SvgRenderOutput,
} from '@/types'
import type { LogEntry } from '@/types'
import type { Project } from '@/types/project'

interface ReplicadExportDialogProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  shapes?: (MeshRenderOutput | SvgRenderOutput)[] | null
}

type ReplicadFormat = ExportFileTypes | 'svg'

const SOLID_FORMATS: ExportFormat[] = [
  {
    id: 'step',
    label: 'STEP',
    ext: 'step',
    description: 'Exact B-rep geometry. For machining or another CAD package.',
    group: 'Solid',
  },
  {
    id: 'step-assembly',
    label: 'STEP assembly',
    ext: 'step',
    description: 'B-rep that keeps part names, colours and hierarchy.',
    group: 'Solid',
  },
  {
    id: 'stl-binary',
    label: 'Binary STL',
    ext: 'stl',
    description: 'Triangle mesh for slicers. Compact, no colour.',
    group: 'Mesh',
  },
  {
    id: 'stl',
    label: 'ASCII STL',
    ext: 'stl',
    description: 'The same mesh as plain text. Several times larger.',
    group: 'Mesh',
  },
]

const DRAWING_FORMATS: ExportFormat[] = [
  {
    id: 'svg',
    label: 'SVG',
    ext: 'svg',
    description: 'Vector drawing of every sketch, on one merged canvas.',
    group: 'Drawing',
  },
]

function extensionOf(format: ReplicadFormat) {
  if (format === 'svg') return 'svg'
  return format.startsWith('stl') ? 'stl' : 'step'
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
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

  const [format, setFormat] = React.useState<ReplicadFormat>(
    isSvgOnly ? 'svg' : 'stl-binary',
  )
  const [status, setStatus] = React.useState<ExportPhase>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string>('')
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [exportedFiles, setExportedFiles] = React.useState<
    Array<{ blob: Blob; name: string }>
  >([])

  const [tolerance, setTolerance] = React.useState<number>(0.01)
  const [angularTolerance, setAngularTolerance] = React.useState<number>(30)

  const extension = extensionOf(format)
  const baseProjectName =
    project.name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'model'
  const isArchive = exportedFiles.length > 1
  const filename = isArchive
    ? `${baseProjectName}_export.zip`
    : `${baseProjectName}.${extension}`

  const handleFormatChange = (id: string) => {
    setFormat(id as ReplicadFormat)
    setStatus('idle')
    setErrorMessage('')
    setLogs([])
    setExportedFiles([])
  }

  const handleStartExport = async () => {
    setStatus('exporting')
    setErrorMessage('')
    setLogs([])
    setExportedFiles([])

    try {
      if (format === 'svg') {
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
      } else {
        setExportedFiles(result.files)
        setStatus('success')
      }
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSaveToDevice = async () => {
    if (exportedFiles.length === 0) return

    try {
      if (exportedFiles.length === 1) {
        download(exportedFiles[0].blob, filename)
      } else {
        const zipData: Record<string, Uint8Array> = {}

        for (let i = 0; i < exportedFiles.length; i++) {
          const file = exportedFiles[i]
          const arrayBuffer = await file.blob.arrayBuffer()
          const safeName = (file.name || `shape_${i + 1}`).replace(
            /[^a-zA-Z0-9-_]/g,
            '_',
          )
          zipData[`${safeName}.${extension}`] = new Uint8Array(arrayBuffer)
        }

        const zippedBytes = zipSync(zipData)
        download(new Blob([zippedBytes], { type: 'application/zip' }), filename)
      }
      toast.success(`Saved ${filename}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save files: ${msg}`)
    }
  }

  const meshOptions = format.startsWith('stl') && {
    title: 'Mesh refinement',
    content: (
      <>
        <NumberField
          value={tolerance}
          onChange={(value) => setTolerance(value ?? 0.01)}
          minValue={0.001}
          step={0.001}
          isDisabled={status === 'exporting'}
          className='grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-x-4'
        >
          <div className='flex min-w-0 flex-col'>
            <Label className='text-xs font-medium text-foreground'>
              Linear deflection
            </Label>
            <Description className='text-xs text-muted'>
              Max distance from the true surface, mm
            </Description>
          </div>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input className='tabular-nums' />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <NumberField
          value={angularTolerance}
          onChange={(value) => setAngularTolerance(value ?? 30)}
          minValue={1}
          maxValue={90}
          step={1}
          isDisabled={status === 'exporting'}
          className='grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-x-4'
        >
          <div className='flex min-w-0 flex-col'>
            <Label className='text-xs font-medium text-foreground'>
              Angular deflection
            </Label>
            <Description className='text-xs text-muted'>
              Max angle between adjacent facets, degrees
            </Description>
          </div>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input className='tabular-nums' />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
      </>
    ),
  }

  return (
    <ExportDialog
      isOpen={isOpen}
      onClose={onClose}
      projectName={project.name}
      kernel='Replicad'
      formats={isSvgOnly ? DRAWING_FORMATS : SOLID_FORMATS}
      format={format}
      onFormatChange={handleFormatChange}
      options={meshOptions || undefined}
      filename={filename}
      phase={status}
      size={exportedFiles.reduce((total, file) => total + file.blob.size, 0)}
      fileCount={exportedFiles.length}
      error={errorMessage}
      logs={logs}
      onExport={() => void handleStartExport()}
      onSave={() => void handleSaveToDevice()}
    />
  )
}

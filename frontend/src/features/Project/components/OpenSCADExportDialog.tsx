import * as React from 'react'
import { toast } from 'sonner'

import { ExportDialog } from '@/components/cad/export/ExportDialog'
import type { ExportFormat } from '@/components/cad/export/ExportFormatList'
import type { ExportPhase } from '@/components/cad/export/ExportStatus'
import { classifyOpenScadLog, useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import type { CompileResult } from '@/kernels/openscad/nodeOpenSCADApi'
import type { LogEntry } from '@/types'
import type { Project } from '@/types/project'

const MESH_FORMATS: ExportFormat[] = [
  {
    id: 'binstl',
    label: 'Binary STL',
    ext: 'stl',
    description: 'Triangle mesh for slicers. Compact, no colour.',
    group: 'Mesh',
  },
  {
    id: 'asciistl',
    label: 'ASCII STL',
    ext: 'stl',
    description: 'The same mesh as plain text. Several times larger.',
    group: 'Mesh',
  },
  {
    id: '3mf',
    label: '3MF',
    ext: '3mf',
    description: 'Mesh with units and colour. Preferred by modern slicers.',
    group: 'Mesh',
  },
  {
    id: 'amf',
    label: 'AMF',
    ext: 'amf',
    description: 'XML mesh with colour and materials.',
    group: 'Mesh',
  },
  {
    id: 'off',
    label: 'OFF',
    ext: 'off',
    description: 'Plain vertex and face lists, for mesh tools.',
    group: 'Mesh',
  },
  {
    id: 'csg',
    label: 'CSG',
    ext: 'csg',
    description: 'The evaluated CSG tree, readable by OpenSCAD.',
    group: 'Source',
  },
]

const DRAWING_FORMATS: ExportFormat[] = [
  {
    id: 'svg',
    label: 'SVG',
    ext: 'svg',
    description: 'Vector drawing for the web and illustration tools.',
    group: 'Drawing',
  },
  {
    id: 'dxf',
    label: 'DXF',
    ext: 'dxf',
    description: 'For laser cutters, CNC routers and 2D CAD.',
    group: 'Drawing',
  },
  {
    id: 'pdf',
    label: 'PDF',
    ext: 'pdf',
    description: 'Vector drawing for printing and review.',
    group: 'Drawing',
  },
]

/** The file extension for an OpenSCAD export format id. */
function extensionOf(format: string) {
  return format === 'binstl' || format === 'asciistl' ? 'stl' : format
}

interface OpenSCADExportDialogProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  result: CompileResult | null
  mainFilePath: string | null
  mainFileContent: string | undefined
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
  const [status, setStatus] = React.useState<ExportPhase>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string>('')
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [exportedBlob, setExportedBlob] = React.useState<Blob | null>(null)

  const store = useNodeOpenSCAD((state) => state)

  const baseProjectName =
    project.name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'model'
  const filename = `${baseProjectName}.${extensionOf(format)}`

  const handleFormatChange = (id: string) => {
    setFormat(id)
    setStatus('idle')
    setErrorMessage('')
    setLogs([])
    setExportedBlob(null)
  }

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
      } else {
        setExportedBlob(exportRes.blob)
        setStatus('success')
      }
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSaveToDevice = () => {
    if (!exportedBlob) return

    try {
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

  return (
    <ExportDialog
      isOpen={isOpen}
      onClose={onClose}
      projectName={project.name}
      kernel='OpenSCAD'
      formats={is2DDrawing ? DRAWING_FORMATS : MESH_FORMATS}
      format={format}
      onFormatChange={handleFormatChange}
      filename={filename}
      phase={status}
      size={exportedBlob?.size}
      error={errorMessage}
      logs={logs}
      onExport={() => void handleStartExport()}
      onSave={handleSaveToDevice}
    />
  )
}

import * as React from 'react'
import type { Build123dExportFormat } from 'shared/build123d'
import { BUILD123D_EXPORT_EXTENSIONS } from 'shared/build123d'
import { toast } from 'sonner'

import { ExportDialog } from '@/components/cad/export/ExportDialog'
import type { ExportFormat } from '@/components/cad/export/ExportFormatList'
import type { ExportPhase } from '@/components/cad/export/ExportStatus'
import { useBuild123d } from '@/hooks/useBuild123d'
import { kernelFilesStore } from '@/hooks/useKernelFiles'
import { joinPaths } from '@/lib/utils'
import type { LogEntry } from '@/types'
import type { Project } from '@/types/project'

const FORMATS: ExportFormat[] = [
  {
    id: 'step',
    label: 'STEP',
    ext: 'step',
    description:
      'Exact B-rep geometry with colours and the assembly tree. For machining or another CAD package.',
    group: 'Solid',
  },
  {
    id: 'stl',
    label: 'Binary STL',
    ext: 'stl',
    description: 'Triangle mesh for slicers. Compact, no colour.',
    group: 'Mesh',
  },
  {
    id: 'stl-ascii',
    label: 'ASCII STL',
    ext: 'stl',
    description: 'The same mesh as plain text. Several times larger.',
    group: 'Mesh',
  },
  {
    id: '3mf',
    label: '3MF',
    ext: '3mf',
    description: 'Mesh with units, colour and materials. Far smaller than STL.',
    group: 'Mesh',
  },
  {
    id: 'glb',
    label: 'glTF binary',
    ext: 'glb',
    description: 'For the web, AR and preview tools. Includes UV coordinates.',
    group: 'Scene',
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
  const [status, setStatus] = React.useState<ExportPhase>('idle')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [exported, setExported] = React.useState<Blob | null>(null)
  const sessionId = useBuild123d((state) => state.sessionId)
  const activeRun = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!isOpen) return
    setStatus('idle')
    setErrorMessage('')
    setLogs([])
    setExported(null)
    return () => {
      const runId = activeRun.current
      activeRun.current = null
      if (runId) {
        void window.electron
          ?.cancelBuild123dRun({ sessionId, runId })
          .catch(() => {})
      }
    }
  }, [isOpen, sessionId])

  const extension = BUILD123D_EXPORT_EXTENSIONS[format]
  const filename = `${project.name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'model'}.${extension}`

  const handleFormatChange = (id: string) => {
    setFormat(id as Build123dExportFormat)
    setStatus('idle')
    setErrorMessage('')
    setLogs([])
    setExported(null)
  }

  const fail = (message: string, lines: LogEntry[] = []) => {
    setStatus('error')
    setErrorMessage(message)
    setLogs((previous) => [...previous, ...lines])
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

    const runId = crypto.randomUUID()
    activeRun.current = runId
    try {
      const overrides: Record<string, string> = {}
      for (const [virtualPath, file] of Object.entries(
        kernelFilesStore.getState().files,
      )) {
        if (virtualPath.toLowerCase().endsWith('.py')) {
          overrides[joinPaths(project.directory, virtualPath)] = file.content
        }
      }

      const response = await window.electron?.exportBuild123d({
        sessionId,
        runId,
        mainPath: project.file,
        projectDirectory: project.directory,
        overrides,
        format,
      })

      if (activeRun.current !== runId) return

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
    } catch (error) {
      if (activeRun.current === runId) {
        fail(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (activeRun.current === runId) activeRun.current = null
    }
  }

  const handleSaveToDevice = () => {
    if (!exported) {
      return
    }

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
    <ExportDialog
      isOpen={isOpen}
      onClose={onClose}
      projectName={project.name}
      kernel='build123d'
      note='includes unsaved edits'
      formats={FORMATS}
      format={format}
      onFormatChange={handleFormatChange}
      filename={filename}
      phase={status}
      size={exported?.size}
      error={errorMessage}
      logs={logs}
      onExport={() => void handleStartExport()}
      onSave={handleSaveToDevice}
    />
  )
}

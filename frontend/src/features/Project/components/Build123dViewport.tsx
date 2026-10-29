import * as React from 'react'

import { Build123dViewer } from '@/components-3d/cad-viewer/Build123dViewer'
import type { StageHandle } from '@/components-3d/helpers/Stage'
import { PartTreePanel } from '@/components/build123d/PartTreePanel'
import { BusyIndicator } from '@/components/cad/BusyIndicator'
import { ExportButton } from '@/components/cad/export/ExportButton'
import { ResetViewButton } from '@/components/cad/ResetViewButton'
import { SelectionReadout } from '@/components/cad/SelectionReadout'
import { ViewportStatusBar } from '@/components/cad/ViewportStatusBar'
import {
  PythonEnvHeading,
  PythonEnvPanel,
} from '@/components/python/PythonEnvPanel'
import { useBuild123d } from '@/hooks/useBuild123d'
import { useBuild123dInteraction } from '@/hooks/useBuild123dInteraction'
import { usePythonEnv } from '@/hooks/usePythonEnv'

import { Build123dCompiler } from './Build123dCompiler'
import { Build123dExportDialog } from './Build123dExportDialog'
import { useEditor } from './editor/context'

function Build123dViewportInner() {
  const { project } = useEditor()
  const [isExportOpen, setIsExportOpen] = React.useState(false)
  const model = useBuild123d((state) => state.model)
  const error = useBuild123d((state) => state.error)
  const isBuilding = useBuild123d((state) => state.isBuilding)

  const interaction = useBuild123dInteraction(model)
  const stageRef = React.useRef<StageHandle>(null)

  return (
    <div className='relative h-full w-full'>
      <Build123dViewer
        model={model}
        hasError={Boolean(error)}
        interaction={interaction}
        stageRef={stageRef}
      />

      {model && (
        <PartTreePanel
          tree={model.tree}
          visibility={interaction.visibility}
          onToggle={interaction.setVisible}
          selectedId={interaction.selectedNode}
          onSelect={interaction.selectNode}
        />
      )}

      {/* Viewport Ribbon Bar */}
      {model && (
        <div className='pointer-events-none absolute top-2 right-2 left-2 z-20 flex justify-end gap-2'>
          <ExportButton onPress={() => setIsExportOpen(true)} />
        </div>
      )}

      <Build123dExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        project={project}
      />

      <ViewportStatusBar>
        <ResetViewButton stageRef={stageRef} />
        <SelectionReadout selection={interaction.selection} />
        <BusyIndicator active={isBuilding} label='Building...' />
      </ViewportStatusBar>

      <Build123dCompiler />
    </div>
  )
}

export function Build123dViewport() {
  const env = usePythonEnv()

  // Editing needs nothing; only building does. So the environment gates the
  // viewport rather than the project.
  if (env.status?.state !== 'ready') {
    return (
      <div className='h-full overflow-y-auto flex items-center justify-center p-6'>
        <div className='w-full max-w-md flex flex-col gap-4 rounded-xl border border-border bg-surface p-5'>
          <PythonEnvHeading />
          <PythonEnvPanel env={env} />
        </div>
      </div>
    )
  }

  return <Build123dViewportInner />
}

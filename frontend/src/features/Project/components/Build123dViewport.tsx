import * as React from 'react'
import type { ShapeNode } from 'shared/build123d'

import { Build123dViewer } from '@/components-3d/cad-viewer/Build123dViewer'
import { PartTreePanel } from '@/components/build123d/PartTreePanel'
import { BusyIndicator } from '@/components/cad/BusyIndicator'
import {
  PythonEnvHeading,
  PythonEnvPanel,
} from '@/components/python/PythonEnvPanel'
import { useBuild123d } from '@/hooks/useBuild123d'
import { useBuild123dVisibility } from '@/hooks/useBuild123dVisibility'
import { usePythonEnv } from '@/hooks/usePythonEnv'
import { leafIds } from '@/kernels/build123d/tree'

import { Build123dCompiler } from './Build123dCompiler'

function Build123dViewportInner() {
  const model = useBuild123d((state) => state.model)
  const error = useBuild123d((state) => state.error)
  const isBuilding = useBuild123d((state) => state.isBuilding)

  const { visibility, setVisible } = useBuild123dVisibility(model?.tree ?? null)
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null)
  const [selectedParts, setSelectedParts] = React.useState<string[]>([])

  const select = (node: ShapeNode) => {
    const same = selectedNode === node.id
    setSelectedNode(same ? null : node.id)
    setSelectedParts(same ? [] : leafIds(node))
  }

  return (
    <div className='relative h-full w-full'>
      <Build123dViewer
        model={model}
        hasError={Boolean(error)}
        visibility={visibility}
        selectedPartIds={selectedParts}
      />

      {model && (
        <PartTreePanel
          tree={model.tree}
          visibility={visibility}
          onToggle={setVisible}
          selectedId={selectedNode}
          onSelect={select}
        />
      )}

      <BusyIndicator active={isBuilding} label='Building...' />

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

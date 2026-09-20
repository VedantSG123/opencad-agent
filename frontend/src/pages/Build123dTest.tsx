import { Button } from '@heroui/react'
import * as React from 'react'
import * as THREE from 'three'

import { Build123dViewer } from '@/components-3d/cad-viewer/Build123dViewer'
import type { StageHandle } from '@/components-3d/helpers/Stage'
import { PartTreePanel } from '@/components/build123d/PartTreePanel'
import { BusyIndicator } from '@/components/cad/BusyIndicator'
import { ResetViewButton } from '@/components/cad/ResetViewButton'
import { SelectionReadout } from '@/components/cad/SelectionReadout'
import { ViewportStatusBar } from '@/components/cad/ViewportStatusBar'
import { Console } from '@/components/console/Console'
import { Build123dProvider, useBuild123d } from '@/hooks/useBuild123d'
import { useBuild123dVisibility } from '@/hooks/useBuild123dVisibility'
import { usePythonEnv } from '@/hooks/usePythonEnv'
import { leafIds } from '@/kernels/build123d/tree'
import type { SelectedComponent } from '@/types'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

const DEMO_SCRIPT = `from build123d import *

# A bracket with a bore, a pocket and filleted corners - enough faces and
# curved edges to show whether the tessellation is being read correctly.
plate = Box(60, 40, 8)
plate -= Cylinder(9, 12)
plate -= Pos(20, 10, 0) * Box(10, 10, 20)
plate = fillet(plate.edges().filter_by(Axis.Z), 3)
plate.label = "bracket"
plate.color = Color("#4f8ef7")

boss = Pos(-20, -10, 4) * Cylinder(6, 10, align=(Align.CENTER, Align.CENTER, Align.MIN))
boss -= Pos(-20, -10, 4) * Cylinder(3, 12, align=(Align.CENTER, Align.CENTER, Align.MIN))
boss.label = "boss"
boss.color = Color("#f7a14f")

print(f"bracket volume: {plate.volume:.1f}")

show(plate, boss)
`

function Build123dTestInner() {
  const env = usePythonEnv()
  const model = useBuild123d((state) => state.model)
  const error = useBuild123d((state) => state.error)
  const logs = useBuild123d((state) => state.logs)
  const isBuilding = useBuild123d((state) => state.isBuilding)
  const duration = useBuild123d((state) => state.duration)
  const buildSource = useBuild123d((state) => state.buildSource)
  const clearLogs = useBuild123d((state) => state.clearLogs)
  const [source, setSource] = React.useState(DEMO_SCRIPT)
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null)
  const { visibility, setVisible } = useBuild123dVisibility(model?.tree ?? null)
  const [selectedParts, setSelectedParts] = React.useState<string[]>([])
  const [selection, setSelection] = React.useState<SelectedComponent | null>(
    null,
  )
  const stageRef = React.useRef<StageHandle>(null)

  const isReady = env.status?.state === 'ready'

  React.useEffect(() => {
    if (isReady) {
      void buildSource(DEMO_SCRIPT)
    }
  }, [isReady, buildSource])

  return (
    <div className='h-screen flex flex-col bg-background text-foreground'>
      <div className='flex items-center gap-3 border-b border-border px-4 h-12 shrink-0 electron-no-drag'>
        <span className='text-sm font-semibold'>build123d test</span>
        <Button
          size='sm'
          onPress={() => void buildSource(source)}
          isDisabled={!isReady || isBuilding}
        >
          {isBuilding ? 'Building…' : 'Build'}
        </Button>
        <span className='text-xs text-muted-foreground'>
          {!isReady
            ? `environment: ${env.status?.state ?? 'checking'}`
            : model
              ? `${model.parts.length} part(s), ${model.instances.length} instance(s)${
                  duration ? ` — ${duration}s` : ''
                }`
              : error
                ? 'build failed'
                : '—'}
        </span>
      </div>

      <div className='flex-1 min-h-0 flex'>
        <div className='w-2/5 min-w-0 flex flex-col border-r border-border'>
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            className='flex-1 min-h-0 resize-none bg-background-secondary p-3 font-mono text-xs outline-none'
          />
          <div className='h-56 shrink-0'>
            <Console logs={logs} title='Build log' onClear={clearLogs} />
          </div>
        </div>

        <div className='flex-1 min-w-0 relative'>
          <Build123dViewer
            model={model}
            hasError={!!error}
            visibility={visibility}
            selectedPartIds={selectedParts}
            stageRef={stageRef}
            onSelect={setSelection}
          />
          <ViewportStatusBar>
            <ResetViewButton stageRef={stageRef} />
            <SelectionReadout selection={selection} />
            <BusyIndicator active={isBuilding} label='Building...' />
          </ViewportStatusBar>
          {model && (
            <PartTreePanel
              tree={model.tree}
              visibility={visibility}
              onToggle={setVisible}
              selectedId={selectedNode}
              onSelect={(node) => {
                const same = selectedNode === node.id
                setSelectedNode(same ? null : node.id)
                setSelectedParts(same ? [] : leafIds(node))
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function Build123dTest() {
  return (
    <Build123dProvider>
      <Build123dTestInner />
    </Build123dProvider>
  )
}

import * as React from 'react'

import type { Pick, PickMode } from '@/components/cad/picks'
import { applyPicks, picksByPart } from '@/components/cad/picks'
import { ErrorBoundary } from '@/components/custom/ErrorBoundary'
import { ReplicadSVGViewer } from '@/components/custom/SvgViewer'
import type {
  MeshRenderOutput,
  SelectedComponent,
  SvgRenderOutput,
} from '@/types'

import type { StageHandle } from '../helpers/Stage'
import { ReplicadCombinedMesh } from '../replicad-mesh/ReplicadCombinedMesh'
import { Canvas } from './Canvas'
import { ErrorMesh } from './ErrorMesh'
import { Scene } from './Scene'

const isSvgShapesArray = (
  shapes: (MeshRenderOutput | SvgRenderOutput)[],
): shapes is SvgRenderOutput[] => {
  return shapes.length > 0 && shapes[0].format === 'svg'
}

const isMeshShape = (
  shape: MeshRenderOutput | SvgRenderOutput,
): shape is MeshRenderOutput => {
  return (shape as MeshRenderOutput).format === '3d'
}

const NO_PICKS: Pick[] = []

export const CadViewer: React.FC<CadViewerProps> = ({
  shapes,
  hasError = false,
  mode = 'faces-and-edges',
  stageRef,
  onSelect,
}) => {
  // A rebuild renumbers faces and edges, so a pick from the previous build
  // would land on different geometry. Picks are kept with the shapes they
  // were made on and dropped when those are replaced.
  const [held, setHeld] = React.useState({ shapes, picked: NO_PICKS })
  const picked = held.shapes === shapes ? held.picked : NO_PICKS

  const pick = (next: Pick, additive: boolean) =>
    setHeld((previous) => ({
      shapes,
      picked: applyPicks(
        previous.shapes === shapes ? previous.picked : NO_PICKS,
        [next],
        additive,
      ),
    }))

  const highlighted = React.useMemo(() => picksByPart(picked), [picked])

  const readout = React.useMemo((): SelectedComponent | null => {
    const last = picked.at(-1)
    if (!last) return null
    return last.kind === 'part'
      ? { kind: 'part', subject: last.partId }
      : { kind: last.kind, index: last.index, subject: last.partId }
  }, [picked])

  React.useEffect(() => {
    onSelect?.(readout)
  }, [readout, onSelect])

  if (isSvgShapesArray(shapes)) {
    return <ReplicadSVGViewer shapes={shapes} />
  }

  return (
    <ErrorBoundary
      fallback={
        <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
          3D viewer error — try rebuilding
        </div>
      }
    >
      <Canvas
        key='3d'
        orthographic
        onPointerMissed={(event) => {
          if (!event.shiftKey) setHeld({ shapes, picked: NO_PICKS })
        }}
      >
        <Scene stageRef={stageRef} enableDamping>
          {hasError ? (
            <ErrorMesh />
          ) : (
            shapes.map((shape) =>
              isMeshShape(shape) ? (
                <ReplicadCombinedMesh
                  mode={mode}
                  picks={highlighted.get(shape.name)}
                  onPick={pick}
                  shape={shape}
                  key={shape.name}
                />
              ) : null,
            )
          )}
        </Scene>
      </Canvas>
    </ErrorBoundary>
  )
}

type CadViewerProps = {
  shapes: (MeshRenderOutput | SvgRenderOutput)[]
  hasError?: boolean
  mode?: PickMode
  stageRef?: React.Ref<StageHandle>
  onSelect?: (selection: SelectedComponent | null) => void
}

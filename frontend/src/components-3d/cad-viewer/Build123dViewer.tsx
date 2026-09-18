import * as React from 'react'

import { ErrorBoundary } from '@/components/custom/ErrorBoundary'
import { partsBounds } from '@/kernels/build123d/bounds'
import type { DecodedModel } from '@/kernels/build123d/decode'
import type { VisibilityMap } from '@/kernels/build123d/tree'

import { Build123dPartMesh } from '../build123d-mesh/Build123dPartMesh'
import { SelectionBox } from '../build123d-mesh/SelectionBox'
import type { StageHandle } from '../helpers/Stage'
import { Canvas } from './Canvas'
import { ErrorMesh } from './ErrorMesh'
import { Scene } from './Scene'

export type Build123dSelection = {
  partId: string
  index: number
}

type Build123dViewerProps = {
  model: DecodedModel | null
  hasError?: boolean
  stageRef?: React.Ref<StageHandle>
  visibility?: VisibilityMap
  /** Parts to draw a selection box around, by id. */
  selectedPartIds?: string[]
  onSelect?: (
    kind: 'face' | 'edge',
    selection: Build123dSelection | null,
  ) => void
}

export const Build123dViewer: React.FC<Build123dViewerProps> = ({
  model,
  hasError = false,
  stageRef,
  visibility,
  selectedPartIds,
  onSelect,
}) => {
  const [face, setFace] = React.useState<Build123dSelection | null>(null)
  const [edge, setEdge] = React.useState<Build123dSelection | null>(null)

  // Clicking the same entity twice clears it, which is how the replicad viewer
  // already behaves and the only way to deselect without a modifier key.
  const toggle = (
    kind: 'face' | 'edge',
    set: (value: Build123dSelection | null) => void,
    current: Build123dSelection | null,
  ) => {
    return (partId: string, index: number) => {
      const next =
        index < 0 || (current?.partId === partId && current.index === index)
          ? null
          : { partId, index }
      set(next)
      onSelect?.(kind, next)
    }
  }

  const selected = React.useMemo(() => {
    if (!model || !selectedPartIds?.length) {
      return null
    }
    const wanted = new Set(selectedPartIds)
    return partsBounds(model.parts.filter((part) => wanted.has(part.id)))
  }, [model, selectedPartIds])

  const selectFace = toggle('face', setFace, face)
  const selectEdge = toggle('edge', setEdge, edge)

  return (
    <ErrorBoundary
      fallback={
        <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
          3D viewer error — try rebuilding
        </div>
      }
    >
      <Canvas
        orthographic
        onCreated={(state) => (state.gl.localClippingEnabled = true)}
      >
        <Scene stageRef={stageRef} enableDamping>
          {hasError ? (
            <ErrorMesh />
          ) : (
            model?.parts.map((part) => (
              <Build123dPartMesh
                key={part.id}
                part={part}
                visible={visibility?.[part.id]}
                selectedFace={face?.partId === part.id ? face.index : null}
                selectedEdge={edge?.partId === part.id ? edge.index : null}
                onFaceClick={selectFace}
                onEdgeClick={selectEdge}
              />
            ))
          )}
          {selected && !hasError && <SelectionBox bounds={selected} />}
        </Scene>
      </Canvas>
    </ErrorBoundary>
  )
}

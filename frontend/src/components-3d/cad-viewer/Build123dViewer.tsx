import * as React from 'react'

import { activeSelection } from '@/components/cad/activeSelection'
import { ErrorBoundary } from '@/components/custom/ErrorBoundary'
import { partsBounds } from '@/kernels/build123d/bounds'
import type { DecodedModel } from '@/kernels/build123d/decode'
import {
  curveTypeName,
  surfaceTypeName,
} from '@/kernels/build123d/geometryTypes'
import type { VisibilityMap } from '@/kernels/build123d/tree'
import type { ComponentKind, SelectedComponent } from '@/types'

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
  onSelect?: (selection: SelectedComponent | null) => void
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
  const [lastKind, setLastKind] = React.useState<ComponentKind | null>(null)

  // Clicking the same entity twice clears it, which is how the replicad viewer
  // already behaves and the only way to deselect without a modifier key.
  const toggle = (
    kind: ComponentKind,
    set: (value: Build123dSelection | null) => void,
    current: Build123dSelection | null,
  ) => {
    return (partId: string, index: number) => {
      const next =
        index < 0 || (current?.partId === partId && current.index === index)
          ? null
          : { partId, index }
      set(next)
      setLastKind(next ? kind : null)
    }
  }

  const selected = React.useMemo(() => {
    if (!model || !selectedPartIds?.length) {
      return null
    }
    const wanted = new Set(selectedPartIds)
    return partsBounds(model.parts.filter((part) => wanted.has(part.id)))
  }, [model, selectedPartIds])

  const readout = React.useMemo((): SelectedComponent | null => {
    const active = activeSelection(lastKind, face, edge)
    if (!model || !active) {
      return null
    }

    const { kind, value } = active
    const part = model.parts.find((candidate) => candidate.id === value.partId)

    return {
      kind,
      index: value.index,
      subject: part?.name,
      geometryType:
        kind === 'edge'
          ? curveTypeName(part?.instance.edgeTypes[value.index])
          : surfaceTypeName(part?.instance.faceTypes[value.index]),
    }
  }, [model, face, edge, lastKind])

  React.useEffect(() => {
    onSelect?.(readout)
  }, [readout, onSelect])

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
      <Canvas orthographic>
        <Scene stageRef={stageRef}>
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

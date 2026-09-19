import * as React from 'react'

import { activeSelection } from '@/components/cad/activeSelection'
import { SelectionReadout } from '@/components/cad/SelectionReadout'
import { ErrorBoundary } from '@/components/custom/ErrorBoundary'
import { ReplicadSVGViewer } from '@/components/custom/SvgViewer'
import type {
  ComponentKind,
  MeshRenderOutput,
  SelectedComponent,
  SvgRenderOutput,
} from '@/types'

import type { StageHandle } from '../helpers/Stage'
import { ReplicadCombinedMesh } from '../replicad-mesh/ReplicadCombinedMesh'
import { Canvas } from './Canvas'
import { ErrorMesh } from './ErrorMesh'
import type { SelectionType } from './hooks/useSelection'
import { useSelection } from './hooks/useSelection'
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

const highlight = (selection: SelectionType | null, shapeId: string) => {
  return selection && shapeId === selection.shapeId ? selection.index : null
}

export const CadViewer: React.FC<CadViewerProps> = ({
  shapes,
  hasError = false,
  selectionMode = 'all',
  stageRef,
}) => {
  const [selectedFace, selectFace] = useSelection(selectionMode, [
    'all',
    'faces',
  ])
  const [selectedEdge, selectEdge] = useSelection(selectionMode, [
    'all',
    'edges',
  ])
  const [lastKind, setLastKind] = React.useState<ComponentKind | null>(null)

  // The handler is still built once per render, so the debounce inside
  // useSelection keeps its identity across a click.
  const track = (
    kind: ComponentKind,
    select: (shapeId: string) => (event: unknown, index: number) => void,
  ) => {
    return (shapeId: string) => {
      const handler = select(shapeId)
      return (event: unknown, index: number) => {
        setLastKind(kind)
        handler(event, index)
      }
    }
  }

  const trackedFace = track('face', selectFace)
  const trackedEdge = track('edge', selectEdge)

  const active = activeSelection(lastKind, selectedFace, selectedEdge)
  const readout: SelectedComponent | null = active && {
    kind: active.kind,
    index: active.value.index,
    subject: active.value.shapeId,
  }

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
      <SelectionReadout selection={readout} />
      <Canvas key='3d' orthographic>
        <Scene stageRef={stageRef} enableDamping>
          {hasError ? (
            <ErrorMesh />
          ) : (
            shapes.map((shape) => {
              const facesHighlight = highlight(selectedFace, shape.name)
              const edgesHighlight = highlight(selectedEdge, shape.name)

              return isMeshShape(shape) ? (
                <ReplicadCombinedMesh
                  onEdgeClick={trackedEdge(shape.name)}
                  onFaceClick={trackedFace(shape.name)}
                  facesHighlight={
                    facesHighlight !== null ? [facesHighlight] : undefined
                  }
                  edgesHighlight={
                    edgesHighlight !== null ? [edgesHighlight] : undefined
                  }
                  shape={shape}
                  key={shape.name}
                />
              ) : null
            })
          )}
        </Scene>
      </Canvas>
    </ErrorBoundary>
  )
}

type CadViewerProps = {
  shapes: (MeshRenderOutput | SvgRenderOutput)[]
  hasError?: boolean
  selectionMode?: 'all' | 'faces' | 'edges'
  stageRef?: React.Ref<StageHandle>
}

import type { ThreeEvent } from '@react-three/fiber'
import * as React from 'react'

import type { PartPicks, Pick, PickMode } from '@/components/cad/picks'
import { allIndices, pickInMode, picksInMode } from '@/components/cad/picks'
import type { ComponentKind, MeshRenderOutput } from '@/types'

import { useEdgeEvent } from './hooks/useEdgeEvent'
import { useFaceEvent } from './hooks/useFaceEvent'
import { ReplicadEdgesMesh } from './ReplicadEdgesMesh'
import { ReplicadFacesMesh } from './ReplicadFacesMesh'

const NONE: number[] = []

export function ReplicadCombinedMesh({
  shape,
  mode,
  picks,
  onPick,
}: ReplicadCombinedMeshProps) {
  // Stopped so that a click on an edge does not also pick the face behind it.
  const picker =
    (kind: ComponentKind) => (event: ThreeEvent<MouseEvent>, index: number) => {
      event.stopPropagation()
      const pick = pickInMode(mode, kind, shape.name, index)
      if (pick) onPick?.(pick, event.shiftKey)
    }
  // Faces take clicks in every mode so that they still hide the edges behind
  // them; see Build123dPartMesh.
  const pickEdges = Boolean(onPick) && picksInMode(mode, 'edge')
  const handleEdgeClick = useEdgeEvent(pickEdges ? picker('edge') : null)
  const handleFaceClick = useFaceEvent(onPick ? picker('face') : null)

  const faceCount = shape.mesh?.faceGroups?.length ?? 0
  const facesHighlight = React.useMemo(
    () => (picks?.whole ? allIndices(faceCount) : (picks?.faces ?? NONE)),
    [picks, faceCount],
  )

  if (!shape.mesh || !shape.edges) {
    return null
  }
  return (
    <>
      <ReplicadFacesMesh
        faces={shape.mesh}
        highlights={facesHighlight}
        defaultHighlights={shape.highlights}
        hoverable={picksInMode(mode, 'face') && mode !== 'parts'}
        onClick={handleFaceClick}
        color={shape.color}
      />
      <ReplicadEdgesMesh
        edges={shape.edges}
        highlights={picks?.edges ?? NONE}
        defaultHighlights={shape.highlights}
        hoverable={pickEdges && mode !== 'parts'}
        onClick={handleEdgeClick}
        color={shape.color}
      />
    </>
  )
}

type ReplicadCombinedMeshProps = {
  shape: MeshRenderOutput
  mode: PickMode
  /** This shape's picks; memoise them, the highlights compare by identity. */
  picks?: PartPicks
  onPick?: (pick: Pick, additive: boolean) => void
}

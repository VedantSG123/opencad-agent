import type { ThreeEvent } from '@react-three/fiber'

import type { Pick } from '@/components/cad/picks'
import type { MeshRenderOutput } from '@/types'

import { useEdgeEvent } from './hooks/useEdgeEvent'
import { useFaceEvent } from './hooks/useFaceEvent'
import { ReplicadEdgesMesh } from './ReplicadEdgesMesh'
import { ReplicadFacesMesh } from './ReplicadFacesMesh'

export function ReplicadCombinedMesh({
  shape,
  onPick,
  edgesHighlight,
  facesHighlight,
}: ReplicadCombinedMeshProps) {
  // Stopped so that a click on an edge does not also pick the face behind it.
  const picker =
    (kind: Pick['kind']) => (event: ThreeEvent<MouseEvent>, index: number) => {
      event.stopPropagation()
      onPick?.({ kind, partId: shape.name, index }, event.shiftKey)
    }
  const handleEdgeClick = useEdgeEvent(onPick ? picker('edge') : null)
  const handleFaceClick = useFaceEvent(onPick ? picker('face') : null)

  if (!shape.mesh || !shape.edges) {
    return null
  }
  return (
    <>
      <ReplicadFacesMesh
        faces={shape.mesh}
        highlights={facesHighlight}
        defaultHighlights={shape.highlights}
        onClick={handleFaceClick}
        color={shape.color}
      />
      <ReplicadEdgesMesh
        edges={shape.edges}
        highlights={edgesHighlight}
        defaultHighlights={shape.highlights}
        onClick={handleEdgeClick}
        color={shape.color}
      />
    </>
  )
}

type ReplicadCombinedMeshProps = {
  shape: MeshRenderOutput
  onPick?: (pick: Pick, additive: boolean) => void
  /** Memoise these; the highlight materials compare them by identity. */
  edgesHighlight?: number[]
  facesHighlight?: number[]
}

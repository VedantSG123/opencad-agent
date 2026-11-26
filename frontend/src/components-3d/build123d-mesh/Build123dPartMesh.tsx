import type { ThreeEvent } from '@react-three/fiber'
import { useLoader } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

import type { PartPicks, Pick, PickMode } from '@/components/cad/picks'
import { allIndices, pickInMode, picksInMode } from '@/components/cad/picks'
import type { DecodedPart } from '@/kernels/build123d/decode'
import { edgeOfVertex, faceOfTriangle } from '@/kernels/build123d/picking'

import { useEdgeHighlightMaterial } from '../highlight/useEdgeHighlightMaterial'
import { useFaceHighlightMaterial } from '../highlight/useFaceHighlightMaterial'
import getMeshColors from '../replicad-mesh/meshColors'
import { useBuild123dEdgeGeometry } from './hooks/useBuild123dEdgeGeometry'
import { useBuild123dFaceGeometry } from './hooks/useBuild123dFaceGeometry'

const DEFAULT_COLOR = '#7E99A3'

const NONE: number[] = []

type Build123dPartMeshProps = {
  part: DecodedPart
  visible?: { faces: boolean; edges: boolean }
  mode: PickMode
  /** This part's picks; memoise them, the highlights compare by identity. */
  picks?: PartPicks
  onPick?: (pick: Pick, additive: boolean) => void
}

export function Build123dPartMesh({
  part,
  visible,
  mode,
  picks,
  onPick,
}: Build123dPartMeshProps) {
  const faceGeometry = useBuild123dFaceGeometry(part.instance)
  const edgeGeometry = useBuild123dEdgeGeometry(part.instance)
  const matcap = useLoader(THREE.TextureLoader, '/matcap-main.png')

  const [hoveredFace, setHoveredFace] = React.useState<number | null>(null)
  const [hoveredEdge, setHoveredEdge] = React.useState<number | null>(null)

  const faceCount = part.instance.trianglesPerFace.length
  const selectedFaces = React.useMemo(
    () => (picks?.whole ? allIndices(faceCount) : (picks?.faces ?? NONE)),
    [picks, faceCount],
  )
  const selectedEdges = picks?.edges ?? NONE

  // R3F only hits objects with handlers, so faces keep theirs in every mode:
  // without them a click in edges mode would reach an edge hidden behind a
  // face. Edges drop theirs in faces mode, which is what lets a click through.
  // Hovering one face while a click picks the whole part says the wrong thing,
  // so parts mode shows no hover.
  const pickEdges = picksInMode(mode, 'edge')
  const hoverFaces = picksInMode(mode, 'face') && mode !== 'parts'
  const hoverEdges = pickEdges && mode !== 'parts'

  const colors = getMeshColors(part.color ?? DEFAULT_COLOR)
  const transparent = part.alpha !== undefined && part.alpha < 1

  const faceMaterial = useFaceHighlightMaterial({
    matcap,
    color: colors.base,
    hoveredColor: colors.hovered,
    selectedColor: colors.selected,
    selected: selectedFaces,
    hovered: hoveredFace,
    componentCount: faceCount,
    opacity: part.alpha,
    transparent,
    doubleSided: part.renderback,
  })
  const edgeMaterial = useEdgeHighlightMaterial({
    color: colors.line,
    hoveredColor: colors.lineHovered,
    selectedColor: colors.lineSelected,
    selected: selectedEdges,
    hovered: hoveredEdge,
    componentCount: part.instance.segmentsPerEdge.length,
  })

  const handleFaceClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPick || event.faceIndex == null) {
      return
    }
    event.stopPropagation()
    const index = faceOfTriangle(part.instance, event.faceIndex)
    const pick = pickInMode(mode, 'face', part.id, index)
    if (pick) onPick(pick, event.shiftKey)
  }

  const handleEdgeClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPick || event.index == null) {
      return
    }
    event.stopPropagation()
    const index = edgeOfVertex(part.instance, event.index)
    const pick = pickInMode(mode, 'edge', part.id, index)
    if (pick) onPick(pick, event.shiftKey)
  }

  // Dragging the camera keeps the pointer moving over the model, and tracking
  // hover through an orbit is a raycast plus a React render every frame for a
  // highlight nobody is aiming at.
  const handleFaceHover = (event: ThreeEvent<PointerEvent>) => {
    if (event.buttons !== 0 || event.faceIndex == null) return
    event.stopPropagation()
    if (hoverFaces)
      setHoveredFace(faceOfTriangle(part.instance, event.faceIndex))
  }

  const handleEdgeHover = (event: ThreeEvent<PointerEvent>) => {
    if (event.buttons !== 0 || event.index == null) return
    event.stopPropagation()
    setHoveredEdge(edgeOfVertex(part.instance, event.index))
  }

  const shown = visible ?? part.visible

  // A shape can lack one kind entirely - a Line has no faces at all - and an
  // empty geometry still costs a draw call and a raycast.
  const hasFaces = part.instance.triangles.length > 0
  const hasEdges = part.instance.edges.length > 0
  const [position, quaternion] = part.location

  return (
    <group position={position} quaternion={quaternion}>
      {shown.faces && hasFaces && (
        <mesh
          geometry={faceGeometry}
          material={faceMaterial}
          onClick={handleFaceClick}
          onPointerMove={handleFaceHover}
          onPointerOut={() => setHoveredFace(null)}
        />
      )}
      {shown.edges && hasEdges && (
        <lineSegments
          geometry={edgeGeometry}
          material={edgeMaterial}
          onClick={pickEdges ? handleEdgeClick : undefined}
          onPointerMove={hoverEdges ? handleEdgeHover : undefined}
          onPointerOut={() => setHoveredEdge(null)}
        />
      )}
    </group>
  )
}

useLoader.preload(THREE.TextureLoader, '/matcap-main.png')

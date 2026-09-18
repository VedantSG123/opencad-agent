import { useTexture } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as React from 'react'

import type { DecodedPart } from '@/kernels/build123d/decode'
import { edgeOfVertex, faceOfTriangle } from '@/kernels/build123d/picking'

import getMeshColors from '../replicad-mesh/meshColors'
import { useBuild123dEdgeGeometry } from './hooks/useBuild123dEdgeGeometry'
import { useBuild123dFaceGeometry } from './hooks/useBuild123dFaceGeometry'
import { useHighlightGroups } from './hooks/useHighlightGroups'

const DEFAULT_COLOR = '#7E99A3'

type Build123dPartMeshProps = {
  part: DecodedPart
  visible?: { faces: boolean; edges: boolean }
  selectedFace?: number | null
  selectedEdge?: number | null
  onFaceClick?: (partId: string, face: number) => void
  onEdgeClick?: (partId: string, edge: number) => void
}

const EMPTY: number[] = []

export function Build123dPartMesh({
  part,
  visible,
  selectedFace,
  selectedEdge,
  onFaceClick,
  onEdgeClick,
}: Build123dPartMeshProps) {
  const faceGeometry = useBuild123dFaceGeometry(part.instance)
  const edgeGeometry = useBuild123dEdgeGeometry(part.instance)
  const matcap = useTexture('/matcap-main.png')

  const faceHighlights = React.useMemo(
    () => (selectedFace != null && selectedFace >= 0 ? [selectedFace] : EMPTY),
    [selectedFace],
  )
  const edgeHighlights = React.useMemo(
    () => (selectedEdge != null && selectedEdge >= 0 ? [selectedEdge] : EMPTY),
    [selectedEdge],
  )

  useHighlightGroups(faceGeometry, faceHighlights)
  useHighlightGroups(edgeGeometry, edgeHighlights)

  const handleFaceClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onFaceClick || event.faceIndex == null) {
      return
    }
    event.stopPropagation()
    onFaceClick(part.id, faceOfTriangle(part.instance, event.faceIndex))
  }

  const handleEdgeClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onEdgeClick || event.index == null) {
      return
    }
    event.stopPropagation()
    onEdgeClick(part.id, edgeOfVertex(part.instance, event.index))
  }

  const shown = visible ?? part.visible
  const [position, quaternion] = part.location
  const colors = getMeshColors(part.color ?? DEFAULT_COLOR)
  const transparent = part.alpha !== undefined && part.alpha < 1

  return (
    <group position={position} quaternion={quaternion}>
      {shown.faces && (
        <mesh geometry={faceGeometry} onClick={handleFaceClick}>
          <meshMatcapMaterial
            attach='material-0'
            matcap={matcap}
            color={colors.base}
            transparent={transparent}
            opacity={part.alpha}
            polygonOffset
            polygonOffsetFactor={2}
            polygonOffsetUnits={1}
          />
          <meshMatcapMaterial
            attach='material-1'
            matcap={matcap}
            color={colors.selected}
            transparent={transparent}
            opacity={part.alpha}
            polygonOffset
            polygonOffsetFactor={2}
            polygonOffsetUnits={1}
          />
        </mesh>
      )}
      {shown.edges && (
        <lineSegments geometry={edgeGeometry} onClick={handleEdgeClick}>
          <lineBasicMaterial attach='material-0' color={colors.line} />
          <lineBasicMaterial attach='material-1' color={colors.lineSelected} />
        </lineSegments>
      )}
    </group>
  )
}

useTexture.preload('/matcap-main.png')

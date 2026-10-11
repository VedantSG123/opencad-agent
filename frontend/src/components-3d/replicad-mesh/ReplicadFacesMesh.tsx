import type { ThreeElements, ThreeEvent } from '@react-three/fiber'
import { useLoader } from '@react-three/fiber'
import * as React from 'react'
import type { ReplicadMeshedFaces } from 'replicad-threejs-helper'
import * as THREE from 'three'

import { useFaceHighlightMaterial } from '../highlight/useFaceHighlightMaterial'
import { getFaceIndexFromEvent } from './hooks/useFaceEvent'
import { useReplicadFaceGeometry } from './hooks/useReplicadFaceGeometry'
import getMeshColors from './meshColors'

const NONE: number[] = []

export const ReplicadFacesMesh: React.FC<ReplicadFacesMeshProps> = ({
  faces,
  defaultHighlights,
  highlights = NONE,
  opacity,
  color,
  ...rest
}) => {
  const geometry = useReplicadFaceGeometry(faces, defaultHighlights || NONE)
  const matcapTexture = useLoader(THREE.TextureLoader, '/matcap-main.png')

  const [hovered, setHovered] = React.useState<number | null>(null)

  const meshColors = getMeshColors(color)
  const material = useFaceHighlightMaterial({
    matcap: matcapTexture,
    color: meshColors.base,
    hoveredColor: meshColors.hovered,
    selectedColor: meshColors.selected,
    selected: highlights,
    hovered,
    componentCount: faces.faceGroups?.length ?? 0,
    opacity,
    transparent: opacity !== undefined && opacity < 1,
  })

  // Skipped while a button is down, so an orbit is not a raycast and a React
  // render per pointer move for a highlight nobody is aiming at.
  const handleHover = (event: ThreeEvent<PointerEvent>) => {
    if (event.buttons !== 0 || event.faceIndex == null) return
    event.stopPropagation()
    setHovered(getFaceIndexFromEvent(event))
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      onPointerMove={handleHover}
      onPointerOut={() => setHovered(null)}
      {...rest}
    />
  )
}

useLoader.preload(THREE.TextureLoader, '/matcap-main.png')

type ReplicadFacesMeshProps = ThreeElements['mesh'] & {
  faces: ReplicadMeshedFaces
  defaultHighlights?: number[]
  highlights?: number[]
  opacity?: number
  color?: string
}

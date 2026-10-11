import type { ThreeElements, ThreeEvent } from '@react-three/fiber'
import * as React from 'react'
import type { ReplicadMeshedEdges } from 'replicad-threejs-helper'

import { useEdgeHighlightMaterial } from '../highlight/useEdgeHighlightMaterial'
import { getEdgeIndexFromEvent } from './hooks/useEdgeEvent'
import { useReplicadEdgeGeometry } from './hooks/useReplicadEdgeGeometry'
import getMeshColors from './meshColors'

const NONE: number[] = []

export const ReplicadEdgesMesh: React.FC<ReplicadEdgesMeshProps> = ({
  edges,
  defaultHighlights,
  highlights = NONE,
  opacity,
  color,
  ...rest
}) => {
  const geometry = useReplicadEdgeGeometry(edges, defaultHighlights || NONE)

  const [hovered, setHovered] = React.useState<number | null>(null)

  const meshColors = getMeshColors(color)
  const material = useEdgeHighlightMaterial({
    color: meshColors.line,
    hoveredColor: meshColors.lineHovered,
    selectedColor: meshColors.lineSelected,
    selected: highlights,
    hovered,
    componentCount: edges.edgeGroups?.length ?? 0,
    opacity,
    transparent: opacity !== undefined && opacity < 1,
  })

  const handleHover = (event: ThreeEvent<PointerEvent>) => {
    if (event.buttons !== 0 || event.index == null) return
    event.stopPropagation()
    setHovered(getEdgeIndexFromEvent(event))
  }

  return (
    <lineSegments
      geometry={geometry}
      material={material}
      onPointerMove={handleHover}
      onPointerOut={() => setHovered(null)}
      {...rest}
    />
  )
}

type ReplicadEdgesMeshProps = ThreeElements['lineSegments'] & {
  edges: ReplicadMeshedEdges
  defaultHighlights?: number[]
  highlights?: number[]
  opacity?: number
  color?: string
}

import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'
import { MeshMatcapNodeMaterial } from 'three/webgpu'

import { highlightColors } from './nodes'
import { HighlightState } from './state'

type FaceHighlightOptions = {
  matcap: THREE.Texture
  color: string
  hoveredColor: string
  selectedColor: string
  /** BRep face indices to mark selected; memoise it, compared by identity. */
  selected: readonly number[]
  /** BRep face index under the pointer, if any. */
  hovered: number | null
  /** BRep face count, which sizes the state texture. */
  componentCount: number
  opacity?: number
  transparent: boolean
  /** Draw the far side too, for a shape that has no inside. */
  doubleSided?: boolean
}

export function useFaceHighlightMaterial({
  matcap,
  color,
  hoveredColor,
  selectedColor,
  selected,
  hovered,
  componentCount,
  opacity,
  transparent,
  doubleSided = false,
}: FaceHighlightOptions) {
  const { invalidate } = useThree()

  const state = React.useMemo(
    () => new HighlightState(componentCount),
    [componentCount],
  )

  const { material, colors } = React.useMemo(() => {
    const built = highlightColors(state.texture)
    const created = new MeshMatcapNodeMaterial({
      matcap,
      // Pushes the faces back so the edge lines on the same surface win.
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1,
    })
    created.colorNode = built.colorNode
    return { material: created, colors: built }
  }, [matcap, state])

  React.useLayoutEffect(() => {
    colors.base.value.set(color)
    colors.hovered.value.set(hoveredColor)
    colors.selected.value.set(selectedColor)
    material.transparent = transparent
    material.opacity = opacity ?? 1
    // A sketch or a lone face has no far side to cull, so culling it leaves
    // nothing to see from behind.
    material.side = doubleSided ? THREE.DoubleSide : THREE.FrontSide
    invalidate()
  }, [
    material,
    colors,
    color,
    hoveredColor,
    selectedColor,
    opacity,
    transparent,
    doubleSided,
    invalidate,
  ])

  React.useLayoutEffect(() => {
    state.set({ selected, hovered })
    invalidate()
  }, [state, selected, hovered, invalidate])

  React.useEffect(() => {
    return () => {
      material.dispose()
      state.dispose()
      invalidate()
    }
  }, [material, state, invalidate])

  return material
}

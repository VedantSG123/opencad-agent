import { useThree } from '@react-three/fiber'
import * as React from 'react'
import { LineBasicNodeMaterial } from 'three/webgpu'

import { highlightColors } from './nodes'
import { HighlightState } from './state'

type EdgeHighlightOptions = {
  color: string
  hoveredColor: string
  selectedColor: string
  /** BRep edge indices to mark selected; memoise it, compared by identity. */
  selected: readonly number[]
  /** BRep edge index under the pointer, if any. */
  hovered: number | null
  /** BRep edge count, which sizes the state texture. */
  componentCount: number
  opacity?: number
  transparent?: boolean
}

export function useEdgeHighlightMaterial({
  color,
  hoveredColor,
  selectedColor,
  selected,
  hovered,
  componentCount,
  opacity,
  transparent = false,
}: EdgeHighlightOptions) {
  const { invalidate } = useThree()

  const state = React.useMemo(
    () => new HighlightState(componentCount),
    [componentCount],
  )

  const { material, colors } = React.useMemo(() => {
    const built = highlightColors(state.texture)
    const created = new LineBasicNodeMaterial()
    created.colorNode = built.colorNode
    return { material: created, colors: built }
  }, [state])

  React.useLayoutEffect(() => {
    colors.base.value.set(color)
    colors.hovered.value.set(hoveredColor)
    colors.selected.value.set(selectedColor)
    material.transparent = transparent
    material.opacity = opacity ?? 1
    invalidate()
  }, [
    material,
    colors,
    color,
    hoveredColor,
    selectedColor,
    opacity,
    transparent,
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

import * as THREE from 'three'
import {
  attribute,
  float,
  ivec2,
  mix,
  step,
  textureLoad,
  uniform,
} from 'three/tsl'

import { COMPONENT_ID_ATTRIBUTE, HIGHLIGHT_TEXTURE_WIDTH } from './state'

/**
 * Base colour, swapped for the hover or selected colour according to the state
 * texture.
 *
 * Replaces the second material the meshes used to carry: three.js pushes one
 * render item per geometry group as soon as a mesh holds an array of materials,
 * so a group per BRep face cost a draw call per face.
 *
 * `textureLoad` rather than `texture` so the id addresses a texel outright,
 * with no filtering or wrapping to round it onto a neighbour.
 */
export function highlightColors(state: THREE.DataTexture) {
  const base = uniform(new THREE.Color())
  const hovered = uniform(new THREE.Color())
  const selected = uniform(new THREE.Color())

  const id = attribute(COMPONENT_ID_ATTRIBUTE, 'float')
  const width = float(HIGHLIGHT_TEXTURE_WIDTH)
  const texel = ivec2(id.mod(width), id.div(width).floor())
  const flag = textureLoad(state, texel).r

  // step() over the two thresholds keeps the three-way pick branchless.
  const marked = step(float(0.25), flag)
  const isSelected = step(float(0.75), flag)
  const colorNode = mix(base, mix(hovered, selected, isSelected), marked)

  return { colorNode, base, hovered, selected }
}

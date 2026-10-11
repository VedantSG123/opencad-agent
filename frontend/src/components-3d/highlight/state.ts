import * as THREE from 'three'

/** Per-vertex BRep face or edge index, looked up in the state texture. */
export const COMPONENT_ID_ATTRIBUTE = 'componentId'

/** Texels per row; ids past this wrap onto the next row. */
export const HIGHLIGHT_TEXTURE_WIDTH = 256

/**
 * Texel values the shader reads back as 0, ~0.5 and 1. Selected outranks hover,
 * so pointing at something already selected keeps the selected colour.
 */
const PLAIN = 0
const HOVERED = 128
const SELECTED = 255

export type Highlighted = {
  selected: readonly number[]
  hovered: number | null
}

/**
 * Which components are highlighted, as a texture the shader indexes by id.
 *
 * A set rather than one id because replicad highlights whole groups of faces at
 * once, and a texture rather than a uniform array because the count is only
 * known once a shape arrives. A write is a few hundred bytes on a pointer move,
 * never on a frame.
 */
export class HighlightState {
  readonly texture: THREE.DataTexture
  private readonly flags: Uint8Array

  constructor(componentCount: number) {
    const rows = Math.max(
      1,
      Math.ceil(componentCount / HIGHLIGHT_TEXTURE_WIDTH),
    )
    this.flags = new Uint8Array(HIGHLIGHT_TEXTURE_WIDTH * rows)
    this.texture = new THREE.DataTexture(
      this.flags,
      HIGHLIGHT_TEXTURE_WIDTH,
      rows,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    )
    this.texture.needsUpdate = true
  }

  /** Replaces the whole state. Ids outside the allocated range are dropped. */
  set({ selected, hovered }: Highlighted) {
    this.flags.fill(PLAIN)

    if (hovered !== null && this.holds(hovered)) {
      this.flags[hovered] = HOVERED
    }
    for (const id of selected) {
      if (this.holds(id)) {
        this.flags[id] = SELECTED
      }
    }

    this.texture.needsUpdate = true
  }

  private holds(id: number) {
    return id >= 0 && id < this.flags.length
  }

  dispose() {
    this.texture.dispose()
  }
}

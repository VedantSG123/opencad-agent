import type { ComponentKind } from '@/types'

/**
 * Which of a face and an edge selection the readout should name.
 *
 * Both can be selected at once - clicking a face does not clear a selected
 * edge - so preferring one kind outright means a fresh click on the other kind
 * changes nothing on screen. What the reader wants is whichever they touched
 * last, falling back to the survivor when that one is cleared.
 */
export function activeSelection<T>(
  lastKind: ComponentKind | null,
  face: T | null,
  edge: T | null,
): { kind: ComponentKind; value: T } | null {
  if (lastKind === 'edge' && edge) {
    return { kind: 'edge', value: edge }
  }
  if (lastKind === 'face' && face) {
    return { kind: 'face', value: face }
  }
  if (edge) {
    return { kind: 'edge', value: edge }
  }
  if (face) {
    return { kind: 'face', value: face }
  }
  return null
}

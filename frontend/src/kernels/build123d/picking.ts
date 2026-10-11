import type { DecodedInstance } from './decode'

/**
 * The entity whose run of primitives contains `primitive`.
 *
 * `offsets` is the cumulative count, so the answer is the last entry not past
 * the primitive - a binary search rather than a walk, because a dense model has
 * thousands of faces and this runs on every hover.
 */
function ownerOf(offsets: Uint32Array, primitive: number): number {
  let low = 0
  let high = offsets.length - 2

  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (offsets[mid] <= primitive) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return low
}

/** The BRep face a raycast triangle belongs to, or -1 if it is out of range. */
export function faceOfTriangle(
  instance: DecodedInstance,
  triangleIndex: number,
): number {
  const total = instance.faceOffsets[instance.faceOffsets.length - 1]
  if (triangleIndex < 0 || triangleIndex >= total) {
    return -1
  }
  return ownerOf(instance.faceOffsets, triangleIndex)
}

/**
 * The BRep edge a raycast line segment belongs to, or -1 if out of range.
 *
 * Three.js reports the index of the segment's first vertex, and `LineSegments`
 * consumes two vertices per segment.
 */
export function edgeOfVertex(
  instance: DecodedInstance,
  vertexIndex: number,
): number {
  const segment = Math.floor(vertexIndex / 2)
  const total = instance.edgeOffsets[instance.edgeOffsets.length - 1]
  if (segment < 0 || segment >= total) {
    return -1
  }
  return ownerOf(instance.edgeOffsets, segment)
}

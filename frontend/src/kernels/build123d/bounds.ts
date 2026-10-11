import type { DecodedPart } from './decode'
import { rotateByQuaternion } from './decode'

export type Bounds = {
  min: [number, number, number]
  max: [number, number, number]
  center: [number, number, number]
  size: [number, number, number]
}

/**
 * The world-space box around a set of parts.
 *
 * Every vertex is transformed rather than the eight corners of each part's
 * local box: the corner shortcut is loose under rotation, and this runs once
 * when the selection changes rather than per frame.
 */
export function partsBounds(parts: DecodedPart[]): Bounds | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let found = false

  for (const part of parts) {
    const [translation, rotation] = part.location
    const vertices = part.instance.vertices

    for (let i = 0; i < vertices.length; i += 3) {
      const rotated = rotateByQuaternion(
        [vertices[i], vertices[i + 1], vertices[i + 2]],
        rotation,
      )
      for (let axis = 0; axis < 3; axis++) {
        const value = rotated[axis] + translation[axis]
        if (value < min[axis]) {
          min[axis] = value
        }
        if (value > max[axis]) {
          max[axis] = value
        }
      }
      found = true
    }
  }

  if (!found) {
    return null
  }

  return {
    min,
    max,
    center: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  }
}

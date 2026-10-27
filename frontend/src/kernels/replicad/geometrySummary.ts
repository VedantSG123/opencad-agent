import {
  Face,
  Shape,
  HASH_CODE_MAX,
  getOC,
  isShape3D,
  iterTopo,
  measureShapeSurfaceProperties,
  measureShapeVolumeProperties,
} from 'replicad'
import type { GeometryPart, GeometrySummary } from 'shared'

import type { CleanedShape } from './shape-format'

type Geometry3D = Extract<GeometryPart, { kind: '3d' }>

export function summarizeGeometry(
  shapes: Pick<CleanedShape, 'name' | 'shape'>[],
): GeometrySummary {
  const parts = shapes.map(summarizePart)
  return { parts, overall: summarizeOverall(parts) }
}

function summarizePart({
  name,
  shape,
}: Pick<CleanedShape, 'name' | 'shape'>): GeometryPart {
  try {
    if (!(shape instanceof Shape)) {
      // Drawings cache and own their 2D box; deleting it breaks later SVG rendering.
      const [min, max] = shape.boundingBox.bounds
      return { name, kind: '2d', bounds: { min, max } }
    }

    const box = shape.boundingBox
    try {
      const [min, max] = box.bounds
      const oc = getOC()
      const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false)
      let valid: boolean
      try {
        valid = analyzer.IsValid_2()
      } finally {
        analyzer.delete()
      }

      let solidCount = 0
      const facesOutsideSolids = new Set<number>()
      for (const face of iterTopo(shape.wrapped, 'face')) {
        facesOutsideSolids.add(faceHash(face))
        face.delete()
      }
      for (const solid of iterTopo(shape.wrapped, 'solid')) {
        try {
          solidCount++
          for (const face of iterTopo(solid, 'face')) {
            facesOutsideSolids.delete(faceHash(face))
            face.delete()
          }
        } finally {
          solid.delete()
        }
      }

      let shellCount = 0
      let closed = true
      for (const shell of iterTopo(shape.wrapped, 'shell')) {
        try {
          shellCount++
          if (!oc.BRep_Tool.IsClosed_1(shell)) closed = false
        } finally {
          shell.delete()
        }
      }
      const shellsClosed = shellCount === 0 ? null : closed

      let surfaceArea: number | null = null
      if (shape instanceof Face || isShape3D(shape)) {
        const properties = measureShapeSurfaceProperties(shape)
        try {
          surfaceArea = finite(properties.area)
        } finally {
          properties.delete()
        }
      }

      let volume: number | null = null
      let centerOfMass: Geometry3D['centerOfMass'] = null
      if (
        valid &&
        solidCount > 0 &&
        shellsClosed &&
        isShape3D(shape) &&
        facesOutsideSolids.size === 0
      ) {
        const properties = measureShapeVolumeProperties(shape)
        try {
          const measuredVolume = finite(properties.volume)
          if (measuredVolume > 0) {
            volume = measuredVolume
            centerOfMass = properties.centerOfMass
          }
        } finally {
          properties.delete()
        }
      }

      return {
        name,
        kind: '3d',
        bounds: { min, max },
        solidCount,
        valid,
        shellsClosed,
        surfaceArea,
        volume,
        centerOfMass,
      }
    } finally {
      box.delete()
    }
  } catch (error) {
    return {
      name,
      kind: 'unavailable',
      reason:
        error instanceof Error
          ? error.message
          : 'The kernel could not measure this shape.',
    }
  }
}

function finite(value: number): number {
  if (!Number.isFinite(value))
    throw new Error('The kernel returned a non-finite measurement.')
  return value
}

function faceHash(face: Parameters<typeof iterTopo>[0]): number {
  // The generated OCC declarations omit the numeric return type of HashCode.
  const hash: unknown = face.HashCode(HASH_CODE_MAX)
  if (typeof hash !== 'number')
    throw new Error('The kernel returned an invalid face hash.')
  return hash
}

function summarizeOverall(parts: GeometryPart[]): GeometrySummary['overall'] {
  const measured = parts.filter((part) => part.kind === '3d')
  if (measured.length === 0 || measured.length !== parts.length) return null

  const bounds: Geometry3D['bounds'] = {
    min: [...measured[0].bounds.min],
    max: [...measured[0].bounds.max],
  }
  let solidCount = 0
  let volumeSum: number | null = 0
  let surfaceAreaSum: number | null = 0
  for (const part of measured) {
    for (const axis of [0, 1, 2] as const) {
      bounds.min[axis] = Math.min(bounds.min[axis], part.bounds.min[axis])
      bounds.max[axis] = Math.max(bounds.max[axis], part.bounds.max[axis])
    }
    solidCount += part.solidCount
    volumeSum =
      volumeSum === null || part.volume === null
        ? null
        : volumeSum + part.volume
    surfaceAreaSum =
      surfaceAreaSum === null || part.surfaceArea === null
        ? null
        : surfaceAreaSum + part.surfaceArea
  }
  return { bounds, solidCount, volumeSum, surfaceAreaSum }
}

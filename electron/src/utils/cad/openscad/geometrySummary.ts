import type { GeometryPart, GeometrySummary } from 'shared'
import { openSCADDrawingSummarySchema } from 'shared'

export function summarizeOff(text: string, name: string): GeometryPart {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.split('#')[0].trim())
    .filter(Boolean)
  if (!/^OFF(?:\s|$)/.test(lines[0] ?? ''))
    throw new Error('Expected OFF mesh output.')
  const inline = lines[0].slice(3).trim()
  const header = inline || lines[1]
  const start = inline ? 1 : 2
  const [vertexCount, faceCount] = (header ?? '').split(/\s+/).map(Number)
  if (
    !Number.isSafeInteger(vertexCount) ||
    vertexCount <= 0 ||
    !Number.isSafeInteger(faceCount) ||
    faceCount <= 0 ||
    lines.length < start + vertexCount + faceCount
  ) {
    throw new Error('The OFF mesh has invalid or incomplete counts.')
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < vertexCount; i++) {
    const values = lines[start + i].split(/\s+/).map(Number)
    if (values.length < 3 || !values.slice(0, 3).every(Number.isFinite))
      throw new Error('The OFF mesh contains invalid vertices.')
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], values[axis])
      max[axis] = Math.max(max[axis], values[axis])
    }
  }
  for (let i = 0; i < faceCount; i++) {
    const [count, ...indices] = lines[start + vertexCount + i]
      .split(/\s+/)
      .map(Number)
    if (
      !Number.isSafeInteger(count) ||
      count < 3 ||
      indices.length < count ||
      !indices
        .slice(0, count)
        .every(
          (index) =>
            Number.isSafeInteger(index) && index >= 0 && index < vertexCount,
        )
    )
      throw new Error('The OFF mesh contains invalid faces.')
  }
  return { kind: 'mesh', name, bounds: { min, max }, vertexCount, faceCount }
}

export function summarizeDrawing(value: unknown, name: string): GeometryPart {
  const { bounding_box: bounds } =
    openSCADDrawingSummarySchema.parse(value).geometry
  if (bounds.min.some((value, axis) => value > bounds.max[axis]))
    throw new Error('The drawing has invalid bounds.')
  return { kind: '2d', name, bounds }
}

export function summarizeOpenSCAD(
  name: string,
  measure: () => GeometryPart,
): GeometrySummary {
  try {
    return { parts: [measure()], overall: null }
  } catch (error) {
    return {
      parts: [
        {
          kind: 'unavailable',
          name,
          reason: error instanceof Error ? error.message : String(error),
        },
      ],
      overall: null,
    }
  }
}

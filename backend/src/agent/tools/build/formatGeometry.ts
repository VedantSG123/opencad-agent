import type { GeometryPart, GeometrySummary } from 'shared'

export function formatGeometry(summary: GeometrySummary): string[] {
  const lines = [
    '',
    'Geometry summary (model units; millimetres unless the script uses another scale):',
  ]
  if (summary.overall) {
    const { bounds, solidCount, volumeSum, surfaceAreaSum } = summary.overall
    lines.push(
      `Overall bounds ${formatBounds(bounds)}; solids ${solidCount}; sum of part volumes ${quantity(volumeSum)}; sum of part surface areas ${quantity(surfaceAreaSum)}.`,
      'Part sums count overlaps and shared surfaces separately.',
    )
  }
  for (const part of summary.parts) lines.push(formatPart(part))
  return lines
}

function formatPart(part: GeometryPart): string {
  switch (part.kind) {
    case 'polygon-mesh':
      return `- "${part.name}" (polygon mesh): bounds ${formatBounds(part.bounds)}; vertices ${part.vertexCount}; polygon faces ${part.faceCount}.`
    case 'unavailable':
      return `- "${part.name}": geometry analysis unavailable: ${part.reason}`
    case 'svg':
      return `- "${part.name}" (SVG): bounds ${formatBounds(part.bounds)}.`
    case 'brep':
      return `- "${part.name}" (BRep): bounds ${formatBounds(part.bounds)}; solids ${part.solidCount}; valid ${part.valid}; shells closed ${part.shellsClosed === null ? 'not applicable' : String(part.shellsClosed)}; surface area ${quantity(part.surfaceArea)}; volume ${quantity(part.volume)}; centre of mass ${part.centerOfMass === null ? 'unavailable' : vector(part.centerOfMass)}.`
  }
}

function formatBounds(bounds: { min: number[]; max: number[] }): string {
  return `${vector(bounds.min)} to ${vector(bounds.max)}, size ${vector(bounds.max.map((value, axis) => value - bounds.min[axis]))}`
}

function vector(values: number[]): string {
  return `[${values.map(number).join(', ')}]`
}

function quantity(value: number | null): string {
  return value === null ? 'unavailable' : number(value)
}

function number(value: number): string {
  return String(Number(value.toPrecision(8)))
}

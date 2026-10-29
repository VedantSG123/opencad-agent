import type { BuildReport } from 'shared'
import type { Build123dResult } from 'shared/build123d'

import { decodeModel } from './decode'

export function build123dReport(result: Build123dResult, mainPath?: string) {
  const logs = result.logs
    .split(/\r?\n/)
    .filter((text) => text.trim().length > 0)
    .map((text) => ({ level: 'log' as const, text }))
  const durationMs = result.duration * 1000
  if (!result.ok) {
    const location =
      result.location?.file === mainPath ? result.location : undefined
    return {
      model: null,
      report: {
        status: 'failed',
        durationMs,
        error: {
          message: result.error,
          ...(location
            ? {
                line: location.line,
                ...(location.column === undefined
                  ? {}
                  : { column: location.column }),
              }
            : {}),
        },
        logs,
      } satisfies BuildReport,
    }
  }
  const model = decodeModel(result)
  return {
    model,
    report: {
      status: 'succeeded',
      durationMs,
      logs,
      shapes: model.parts.map((part) => ({
        name: part.name,
        kind: '3d' as const,
        rendered:
          part.instance.triangles.length > 0 ||
          part.instance.edges.length > 0 ||
          part.instance.objVertices.length > 0,
      })),
      ...(result.geometry === undefined ? {} : { geometry: result.geometry }),
    } satisfies BuildReport,
  }
}

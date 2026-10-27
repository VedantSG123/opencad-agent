import type { BuildReport } from 'shared'

import type { WorkerBuildResult } from './builderApi'

export function toBuildReport(
  result: WorkerBuildResult,
  durationMs: number,
): BuildReport {
  const logs = result.logs.map((log) => ({ level: log.type, text: log.text }))

  if (result.error) {
    return {
      status: 'failed',
      durationMs,
      error: {
        message: result.message,
        ...(result.location ?? {}),
      },
      logs,
    }
  }

  return {
    status: 'succeeded',
    durationMs,
    shapes: result.shapes.map((shape) =>
      shape.format === 'svg'
        ? { name: shape.name, kind: '2d', rendered: true }
        : { name: shape.name, kind: '3d', rendered: !shape.error },
    ),
    logs,
    ...(result.geometry === undefined ? {} : { geometry: result.geometry }),
  }
}

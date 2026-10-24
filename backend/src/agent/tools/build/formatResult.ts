import type { BuildLog, BuildReport, BuildRequest, BuiltShape } from 'shared'

const MAX_LOG_LINES = 40
const MAX_LOG_CHARS = 300
const EXCERPT_RADIUS = 2

export function formatBuildReport(
  request: BuildRequest,
  report: BuildReport,
): string {
  switch (report.status) {
    case 'unavailable':
      return `Error: ${request.file} was not built: ${report.reason}`

    case 'succeeded':
      return [
        builtSummary(request.file, report.durationMs, report.shapes),
        ...logSection(report.logs),
      ].join('\n')

    case 'failed': {
      const { message, line, column } = report.error
      const where =
        line === undefined
          ? request.file
          : `${request.file} line ${line}${column === undefined ? '' : `, column ${column}`}`
      return [
        `Build failed after ${seconds(report.durationMs)}: ${where}: ${message}`,
        ...(line === undefined ? [] : ['', excerpt(request.source, line)]),
        ...logSection(report.logs),
      ].join('\n')
    }
  }
}

function builtSummary(
  file: string,
  durationMs: number,
  shapes: BuiltShape[],
): string {
  const head = `Built ${file} in ${seconds(durationMs)}`
  if (shapes.length === 0) {
    return `${head}, but it produced no shapes to render.`
  }

  const lines = shapes.map(
    (shape) =>
      `- "${shape.name}" (${shape.kind.toUpperCase()})${shape.rendered ? '' : ' - built, but could not be drawn'}`,
  )
  return [
    `${head}. ${shapes.length} shape${shapes.length === 1 ? '' : 's'}:`,
    ...lines,
  ].join('\n')
}

function excerpt(source: string, line: number): string {
  const lines = source.split('\n')
  const first = Math.max(1, line - EXCERPT_RADIUS)
  const last = Math.min(lines.length, line + EXCERPT_RADIUS)
  const width = String(last).length

  const out: string[] = []
  for (let number = first; number <= last; number++) {
    const marker = number === line ? '>' : ' '
    out.push(
      `${marker} ${String(number).padStart(width, ' ')} | ${lines[number - 1]}`,
    )
  }
  return out.join('\n')
}

function logSection(logs: BuildLog[]): string[] {
  if (logs.length === 0) return []

  const shown = logs.slice(-MAX_LOG_LINES)
  const dropped = logs.length - shown.length
  return [
    '',
    `Console output (${logs.length} line${logs.length === 1 ? '' : 's'}${dropped > 0 ? `, first ${dropped} omitted` : ''}):`,
    ...shown.map((log) => `[${log.level}] ${clip(log.text)}`),
  ]
}

function clip(text: string): string {
  return text.length > MAX_LOG_CHARS
    ? `${text.slice(0, MAX_LOG_CHARS)}… (${text.length - MAX_LOG_CHARS} more characters)`
    : text
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

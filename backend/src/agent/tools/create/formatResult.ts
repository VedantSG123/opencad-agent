import type { ResolvedCreateTarget } from './resolveCreatePath'

export type FormatCreateResultOptions = {
  displayPath: string
  content: string
  destination: ResolvedCreateTarget['destination']
}

export function formatCreateResult({
  displayPath,
  content,
  destination,
}: FormatCreateResultOptions): string {
  const size =
    content === ''
      ? 'empty'
      : `${plural(countLines(content), 'line', 'lines')}, ${Buffer.byteLength(content, 'utf-8')} bytes`

  if (destination.kind === 'empty-file') {
    return `Wrote ${displayPath} (${size}), which was empty.`
  }

  const note = destination.missingDirectory
    ? ` Created the directory ${destination.missingDirectory} along with it.`
    : ''

  return `Created ${displayPath} (${size}).${note}`
}

/** A trailing newline ends the last line rather than starting another one. */
function countLines(content: string): number {
  const breaks = content.split('\n').length
  return content.endsWith('\n') ? breaks - 1 : breaks
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

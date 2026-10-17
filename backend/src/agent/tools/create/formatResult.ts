export type FormatCreateResultOptions = {
  displayPath: string
  content: string
  /** The directories that had to be made, relative to the project. */
  createdDirectory: string | null
}

export function formatCreateResult({
  displayPath,
  content,
  createdDirectory,
}: FormatCreateResultOptions): string {
  const size =
    content === ''
      ? 'empty'
      : `${plural(countLines(content), 'line', 'lines')}, ${Buffer.byteLength(content, 'utf-8')} bytes`

  const note = createdDirectory
    ? ` Created the directory ${createdDirectory} along with it.`
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

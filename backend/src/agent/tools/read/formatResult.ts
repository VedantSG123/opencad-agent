import type { LineWindow } from './readWindow'

export type FormatReadResultOptions = {
  displayPath: string
  sizeBytes: number
  window: LineWindow
  maxLineChars: number
  maxOutputChars: number
  maxScanBytes: number
}

export function formatReadResult({
  displayPath,
  sizeBytes,
  window,
  maxLineChars,
  maxOutputChars,
  maxScanBytes,
}: FormatReadResultOptions): string {
  const { lines, firstLineNumber, totalLines } = window

  if (lines.length === 0) {
    if (window.stoppedAtScanBudget) {
      return `Error: gave up after scanning ${formatBytes(maxScanBytes)} of ${displayPath} without reaching line ${firstLineNumber}.`
    }
    if (totalLines === 0) {
      return `${displayPath} is empty.`
    }
    return `Error: offset ${firstLineNumber} is past the end of ${displayPath}, which has ${totalLines ?? 0} lines.`
  }

  const lastLineNumber = firstLineNumber + lines.length - 1
  const numberWidth = String(lastLineNumber).length
  const body = lines
    .map(
      (line, index) =>
        `${String(firstLineNumber + index).padStart(numberWidth, ' ')} | ${line}`,
    )
    .join('\n')

  const range =
    totalLines === null
      ? `Lines ${firstLineNumber}-${lastLineNumber}`
      : `Lines ${firstLineNumber}-${lastLineNumber} of ${totalLines}`

  const notes: string[] = []

  if (window.stoppedAtOutputBudget) {
    notes.push(
      `Stopped at the ${maxOutputChars} character output budget before the requested number of lines.`,
    )
  }
  if (window.stoppedAtScanBudget) {
    notes.push(`Stopped after scanning ${formatBytes(maxScanBytes)}.`)
  }
  if (window.continues) {
    notes.push(
      `The file continues past line ${lastLineNumber}. Read on with { "path": "${displayPath}", "offset": ${lastLineNumber + 1} }.`,
    )
  }
  if (window.clippedLines > 0) {
    notes.push(
      `${plural(window.clippedLines, 'line was', 'lines were')} clipped at ${maxLineChars} characters.`,
    )
  }

  const footer = notes.length > 0 ? `\n\n[${notes.join(' ')}]` : ''

  return `File: ${displayPath}\n${range} (${formatBytes(sizeBytes)})\n\n${body}${footer}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${Math.round(value * 10) / 10} ${units[unitIndex]}`
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

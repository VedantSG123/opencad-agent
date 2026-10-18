import type { ParsedRipgrepOutput } from './parseRipgrepJson'

const MAX_LINE_LENGTH = 400
const MAX_OUTPUT_CHARS = 60_000

const TRUNCATION_MARKER = ' ... [line truncated]'

export function formatContentResults(
  parsed: ParsedRipgrepOutput,
  headLimit: number,
): string {
  const sections: string[] = []
  let renderedLines = 0
  let renderedFiles = 0
  let truncated = false

  for (const file of parsed.files) {
    if (renderedLines >= headLimit) {
      truncated = true
      break
    }

    const available = headLimit - renderedLines
    const shown = file.lines.slice(0, available)
    if (shown.length < file.lines.length) truncated = true

    const body = shown.map((line) => {
      const number = line.lineNumber === null ? '?' : String(line.lineNumber)
      const separator = line.isMatch ? ':' : '-'
      return `${number}${separator}${clampLine(line.text)}`
    })

    sections.push([file.path, ...body].join('\n'))
    renderedLines += shown.length
    renderedFiles += 1
  }

  const fileCount = parsed.files.length
  const header = `Found ${plural(parsed.totalMatches, 'match', 'matches')} in ${plural(fileCount, 'file', 'files')}.`
  const footer =
    truncated || renderedFiles < fileCount
      ? `\n\n[Output limited to ${renderedLines} lines across ${renderedFiles} of ${fileCount} files. Narrow the search with \`path\`/\`glob\`/\`type\`, or raise \`headLimit\`.]`
      : ''

  return clampOutput(`${header}\n\n${sections.join('\n\n')}${footer}`)
}

export function formatFileListResults(
  files: string[],
  headLimit: number,
): string {
  const shown = files.slice(0, headLimit)
  const header = `Found ${plural(files.length, 'file', 'files')} with matches.`
  const footer =
    shown.length < files.length
      ? `\n\n[Showing first ${shown.length} of ${files.length} files. Narrow the search or raise \`headLimit\`.]`
      : ''

  return clampOutput(`${header}\n\n${shown.join('\n')}${footer}`)
}

export function formatCountResults(
  counts: { path: string; count: number }[],
  headLimit: number,
): string {
  const total = counts.reduce((sum, entry) => sum + entry.count, 0)
  const shown = counts.slice(0, headLimit)
  const header = `Found ${plural(total, 'matching line', 'matching lines')} in ${plural(counts.length, 'file', 'files')}.`
  const footer =
    shown.length < counts.length
      ? `\n\n[Showing first ${shown.length} of ${counts.length} files. Narrow the search or raise \`headLimit\`.]`
      : ''
  const body = shown.map((entry) => `${entry.path}: ${entry.count}`).join('\n')

  return clampOutput(`${header}\n\n${body}${footer}`)
}

export function parseFileList(stdout: string): string[] {
  return stdout.split('\n').filter((line) => line.trim().length > 0)
}

/**
 * Parses `--count` output (`path:count`). Split from the right because a path
 * can legitimately contain a colon on non-Windows filesystems.
 */
export function parseCounts(stdout: string): { path: string; count: number }[] {
  const entries: { path: string; count: number }[] = []

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const separatorIndex = line.lastIndexOf(':')
    if (separatorIndex === -1) continue

    const count = Number.parseInt(line.slice(separatorIndex + 1), 10)
    if (Number.isNaN(count)) continue

    entries.push({ path: line.slice(0, separatorIndex), count })
  }

  return entries
}

function clampLine(text: string): string {
  // ripgrep keeps \r on CRLF files; it would corrupt the rendered block.
  const normalized = text.replace(/\r$/, '')
  return normalized.length > MAX_LINE_LENGTH
    ? normalized.slice(0, MAX_LINE_LENGTH) + TRUNCATION_MARKER
    : normalized
}

function clampOutput(output: string): string {
  return output.length > MAX_OUTPUT_CHARS
    ? `${output.slice(0, MAX_OUTPUT_CHARS)}\n\n[Output truncated at ${MAX_OUTPUT_CHARS} characters.]`
    : output
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

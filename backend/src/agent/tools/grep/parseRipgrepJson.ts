/**
 * Parser for ripgrep's `--json` event stream (one JSON object per line).
 *
 * Preferred over the plain text output, which would have to be split on `:` -
 * ambiguous on Windows, where absolute paths contain a drive-letter colon.
 */

/** ripgrep emits `{text}` for valid UTF-8 and `{bytes}` (base64) otherwise. */
type RgData = { text?: string; bytes?: string }

type RgEvent = {
  type?: string
  data?: {
    path?: RgData
    lines?: RgData
    line_number?: number | null
  }
}

export type RipgrepLine = {
  /** 1-based line number, or null when ripgrep could not determine one. */
  lineNumber: number | null
  text: string
  isMatch: boolean
}

export type RipgrepFileResult = {
  path: string
  lines: RipgrepLine[]
  matchCount: number
}

export type ParsedRipgrepOutput = {
  files: RipgrepFileResult[]
  totalMatches: number
}

export function parseRipgrepJson(stdout: string): ParsedRipgrepOutput {
  const files: RipgrepFileResult[] = []
  let totalMatches = 0
  let current: RipgrepFileResult | null = null

  for (const rawLine of stdout.split('\n')) {
    if (!rawLine.trim()) continue

    let event: RgEvent
    try {
      event = JSON.parse(rawLine) as RgEvent
    } catch {
      // A killed process can leave a half-written final line behind.
      continue
    }

    switch (event.type) {
      case 'begin': {
        const filePath = decodeData(event.data?.path)
        current = {
          path: filePath === null ? '(unknown file)' : toPosix(filePath),
          lines: [],
          matchCount: 0,
        }
        break
      }
      case 'match':
      case 'context': {
        if (!current) break
        const isMatch = event.type === 'match'
        const text = decodeData(event.data?.lines) ?? ''
        const startLine = event.data?.line_number ?? null

        // In multiline mode a single match event can span several lines.
        const textLines = stripTrailingNewline(text).split('\n')
        textLines.forEach((lineText, index) => {
          current!.lines.push({
            lineNumber: startLine === null ? null : startLine + index,
            text: lineText,
            isMatch,
          })
        })

        if (isMatch) {
          current.matchCount += 1
          totalMatches += 1
        }
        break
      }
      case 'end': {
        if (current) files.push(current)
        current = null
        break
      }
      default:
        break
    }
  }

  // A truncated stream can end without its `end` event.
  if (current) files.push(current)

  return { files, totalMatches }
}

function decodeData(data: RgData | undefined): string | null {
  if (!data) return null
  if (typeof data.text === 'string') return data.text
  if (typeof data.bytes === 'string') {
    return Buffer.from(data.bytes, 'base64').toString('utf8')
  }
  return null
}

function stripTrailingNewline(text: string): string {
  return text.replace(/\r?\n$/, '')
}

/**
 * `--path-separator` is not honoured by ripgrep's JSON output, so Windows
 * paths arrive with backslashes and have to be normalised here. Only on
 * win32 - a backslash is a legal filename character elsewhere.
 */
function toPosix(filePath: string): string {
  return process.platform === 'win32'
    ? filePath.replaceAll('\\', '/')
    : filePath
}

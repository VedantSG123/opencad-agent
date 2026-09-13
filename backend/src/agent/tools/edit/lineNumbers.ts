// Models often copy the `<line number> | <text>` gutter that `read` prints
// straight back into a search block. These strip it off again, and put it back
// when quoting the file in an error.

const DEFAULT_LINE_NUMBER_REGEX = /^\s*\d+\s+\|(?!\|)\s?(.*)$/
const AGGRESSIVE_LINE_NUMBER_REGEX = /^\s*(?:\d+\s)?\|\s(.*)$/

/** A number followed by a single pipe - a double pipe is code, not a gutter. */
export function everyLineHasLineNumbers(content: string): boolean {
  const lines = content.split(/\r?\n/)
  return (
    lines.length > 0 && lines.every((line) => /^\s*\d+\s+\|(?!\|)/.test(line))
  )
}

/**
 * `aggressive` also strips a bare `| ` gutter, for when the model dropped the
 * numbers but kept the pipe. It is the last thing tried before giving up.
 */
export function extractTextFromLineNumberedContent(
  content: string,
  aggressive: boolean = false,
): string {
  const lines = content.split(/\r?\n/)
  const extractedLines = lines.map((line) => {
    const regex = aggressive
      ? AGGRESSIVE_LINE_NUMBER_REGEX
      : DEFAULT_LINE_NUMBER_REGEX
    const match = line.match(regex)
    return match ? match[1] : line
  })

  const lineEndingCharacter = content.includes('\r\n') ? '\r\n' : '\n'
  let result = extractedLines.join(lineEndingCharacter)

  if (content.endsWith(lineEndingCharacter)) {
    if (!result.endsWith(lineEndingCharacter)) {
      result += lineEndingCharacter
    }
  }
  return result
}

export function addLineNumbersToContent(
  content: string,
  startLineNumber: number = 1,
): string {
  if (content === '') {
    return startLineNumber === 1 ? '' : `${startLineNumber} | \n`
  }

  const lines = content.split(/\r?\n/)
  const lineEndingCharacter = content.includes('\r\n') ? '\r\n' : '\n'

  const lastLineEmpty = lines[lines.length - 1] === ''
  if (lastLineEmpty) {
    lines.pop()
  }

  const maxLineNumberWidth = String(startLineNumber + lines.length - 1).length

  const numberedLines = lines
    .map((line, index) => {
      const lineNumber = startLineNumber + index
      const paddedLineNumber = String(lineNumber).padStart(
        maxLineNumberWidth,
        ' ',
      )
      return `${paddedLineNumber} | ${line}`
    })
    .join(lineEndingCharacter)

  return numberedLines + lineEndingCharacter
}

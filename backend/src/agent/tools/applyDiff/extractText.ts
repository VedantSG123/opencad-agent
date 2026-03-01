// Checks if every line in the content has line numbers prefixed (e.g., "1 | content" or "123 | content")
// Line numbers must be followed by a single pipe character (not double pipes)
export function everyLineHasLineNumbers(content: string): boolean {
  const lines = content.split(/\r?\n/) // Handles both CRLF (carriage return (\r) + line feed (\n)) and LF (line feed (\n)) line endings
  return (
    lines.length > 0 && lines.every((line) => /^\s*\d+\s+\|(?!\|)/.test(line))
  )
}

const DEFAULT_LINE_NUMBER_REGEX = /^\s*\d+\s+\|(?!\|)\s?(.*)$/
const AGGRESSIVE_LINE_NUMBER_REGEX = /^\s*(?:\d+\s)?\|\s(.*)$/

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
    return match ? match[1] : line // If the line doesn't match the pattern, return it as is
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

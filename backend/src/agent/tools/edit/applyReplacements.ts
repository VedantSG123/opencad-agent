import { FUZZY_THRESHOLD, fuzzySearch, getSimilarityScore } from './fuzzySearch'
import {
  addLineNumbersToContent,
  everyLineHasLineNumbers,
  extractTextFromLineNumberedContent,
} from './lineNumbers'
import type { Replacement } from './parseReplacements'
import { unescapeMarkers } from './unescapeMarkers'

// How far either side of a stated start line to widen the search when the
// lines there do not match: enough to absorb edits the model has not seen,
// short of rescanning the file and matching something unrelated.
const BUFFER_LINES = 40

const IDENTICAL_CONTENT_ERROR = `Search and replace content are identical - no changes would be made

Debug Info:
- Search and replace must be different to make changes
- Use read to verify the content you want to change`

const EMPTY_SEARCH_ERROR = `Empty search content is not allowed

Debug Info:
- Search content cannot be empty
- Always provide the specific line number in :start_line: and include the content to search for`

function failedSearchError(
  searchChunk: string,
  bestMatchSection: string,
  originalContent: string,
  bestMatchScore: number,
  lineStartNumber?: number,
): string {
  return `No sufficiently good match found for the search content ${lineStartNumber ? 'at line ' + lineStartNumber : ''} (${Math.floor(bestMatchScore * 100)}% similarity, threshold is ${Math.floor(FUZZY_THRESHOLD * 100)}%)

Debug Info:
- Similarity Score: ${Math.floor(bestMatchScore * 100)}%
- Required Threshold: ${Math.floor(FUZZY_THRESHOLD * 100)}%
- Search Range: ${lineStartNumber ? 'start at line ' + lineStartNumber : 'start to end'}
- Tip: Use the read tool to get the latest content of the file before attempting to edit it again.

Search Content:
${searchChunk}

Best Match Content:
${bestMatchSection}

Original Content:
${originalContent}`
}

export type ReplacementFailure = {
  /** The start line the block claimed, or 0 when it stated none. */
  startLine: number
  error: string
}

export type ApplyReplacementsResult = {
  /** The whole file after every block that matched; unchanged if none did. */
  content: string
  appliedCount: number
  failures: ReplacementFailure[]
}

/**
 * Applies each search/replace block in turn, matching by content rather than by
 * line number so a stale start line still lands. Blocks are independent: one
 * that finds no match is reported and the rest still apply.
 */
export function applyReplacements(
  originalContent: string,
  replacements: Replacement[],
): ApplyReplacementsResult {
  let codeLines = originalContent.split(/\r?\n/)

  let lineShift = 0
  let appliedCount = 0
  const failures: ReplacementFailure[] = []

  for (const replacement of replacements) {
    let { searchContent, replaceContent } = replacement
    // Earlier blocks have already moved the lines this one was numbered
    // against, so carry their net change forward.
    let startLineNumber =
      replacement.startLine + (replacement.startLine === 0 ? 0 : lineShift)

    searchContent = unescapeMarkers(searchContent)
    replaceContent = unescapeMarkers(replaceContent)

    const everyLineHasNumbering =
      (everyLineHasLineNumbers(replaceContent) &&
        everyLineHasLineNumbers(searchContent)) ||
      (everyLineHasLineNumbers(searchContent) && replaceContent.trim() === '')

    // A numbered search block carries its own start line, which beats guessing.
    if (everyLineHasNumbering && startLineNumber === 0) {
      startLineNumber = parseInt(
        searchContent.split(/\r?\n/)[0].split('|')[0].trim(),
        10,
      )
    }

    if (everyLineHasNumbering) {
      searchContent = extractTextFromLineNumberedContent(searchContent)
      replaceContent = extractTextFromLineNumberedContent(replaceContent)
    }

    if (searchContent === replaceContent) {
      failures.push({
        startLine: replacement.startLine,
        error: IDENTICAL_CONTENT_ERROR,
      })
      continue
    }

    let searchLines = searchContent === '' ? [] : searchContent.split(/\r?\n/)
    let replaceLines =
      replaceContent === '' ? [] : replaceContent.split(/\r?\n/)

    if (searchLines.length === 0) {
      failures.push({
        startLine: replacement.startLine,
        error: EMPTY_SEARCH_ERROR,
      })
      continue
    }

    const originalSearchContent = searchContent

    let matchIndex = -1
    let bestMatchScore = 0
    let bestMatchContent = ''

    let searchRangeStart = 0
    let searchRangeEnd = codeLines.length - 1

    if (startLineNumber !== 0) {
      const startIndex = startLineNumber - 1
      const endIndex = startIndex + searchLines.length - 1

      const codeSegment = codeLines.slice(startIndex, endIndex + 1).join('\n')
      const similarityScore = getSimilarityScore(
        codeSegment,
        searchLines.join('\n'),
      )

      if (similarityScore >= FUZZY_THRESHOLD) {
        matchIndex = startIndex
        bestMatchScore = similarityScore
        bestMatchContent = codeSegment
      } else {
        searchRangeStart = Math.max(0, startIndex - BUFFER_LINES)
        searchRangeEnd = Math.min(codeLines.length - 1, endIndex + BUFFER_LINES)
      }
    }

    if (matchIndex === -1) {
      const result = fuzzySearch(
        codeLines,
        searchLines.join('\n'),
        searchRangeStart,
        searchRangeEnd,
      )
      matchIndex = result.bestMatchIndex
      bestMatchScore = result.bestScore
      bestMatchContent = result.bestMatchContent
    }

    // Last resort: the model may have kept a `| ` gutter without its numbers,
    // which the ordinary stripping leaves in place.
    if (matchIndex === -1 || bestMatchScore < FUZZY_THRESHOLD) {
      const aggressiveSearchContent = extractTextFromLineNumberedContent(
        searchContent,
        true,
      )
      const aggressiveReplaceContent = extractTextFromLineNumberedContent(
        replaceContent,
        true,
      )

      const aggressiveSearchLines = aggressiveSearchContent
        ? aggressiveSearchContent.split(/\r?\n/)
        : []

      const aggressiveResult = fuzzySearch(
        codeLines,
        aggressiveSearchLines.join('\n'),
        searchRangeStart,
        searchRangeEnd,
      )

      if (
        aggressiveResult.bestMatchIndex !== -1 &&
        aggressiveResult.bestScore >= FUZZY_THRESHOLD
      ) {
        matchIndex = aggressiveResult.bestMatchIndex
        bestMatchScore = aggressiveResult.bestScore
        bestMatchContent = aggressiveResult.bestMatchContent

        searchContent = aggressiveSearchContent
        replaceContent = aggressiveReplaceContent
        searchLines = aggressiveSearchLines
        replaceLines = aggressiveReplaceContent
          ? aggressiveReplaceContent.split(/\r?\n/)
          : []
      } else {
        failures.push({
          startLine: replacement.startLine,
          error: failedSearchError(
            originalSearchContent,
            bestMatchContent ? bestMatchContent : '(no match found)',
            addLineNumbersToContent(
              codeLines.slice(searchRangeStart, searchRangeEnd + 1).join('\n'),
              searchRangeStart + 1,
            ),
            bestMatchScore,
            startLineNumber !== 0 ? startLineNumber : undefined,
          ),
        })
        continue
      }
    }

    const matchedLines = codeLines.slice(
      matchIndex,
      matchIndex + searchLines.length,
    )

    const indentedReplaceLines = reindent(
      replaceLines,
      leadingWhitespace(searchLines[0]),
      leadingWhitespace(matchedLines[0]),
    )

    codeLines = [
      ...codeLines.slice(0, matchIndex),
      ...indentedReplaceLines,
      ...codeLines.slice(matchIndex + searchLines.length),
    ]
    lineShift = lineShift - matchedLines.length + replaceLines.length
    appliedCount++
  }

  const lineEnding = originalContent.includes('\r\n') ? '\r\n' : '\n'

  return {
    content: codeLines.join(lineEnding),
    appliedCount,
    failures,
  }
}

/**
 * Rebases the replacement onto the indentation the file actually uses: each
 * line keeps its depth relative to the first search line, measured in
 * characters. A model that indents its block differently from the file still
 * produces correctly nested output.
 */
function reindent(
  replaceLines: string[],
  searchBaseIndent: string,
  matchedBaseIndent: string,
): string[] {
  return replaceLines.map((line) => {
    const indentDifference =
      leadingWhitespace(line).length - searchBaseIndent.length

    const finalIndent =
      indentDifference < 0
        ? matchedBaseIndent.slice(
            0,
            Math.max(0, matchedBaseIndent.length + indentDifference),
          )
        : matchedBaseIndent + ' '.repeat(indentDifference)

    return finalIndent + line.trim()
  })
}

function leadingWhitespace(line: string | undefined): string {
  return line?.match(/^[\t ]*/)?.[0] ?? ''
}

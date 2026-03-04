/* eslint-disable no-useless-assignment */
import { tool } from 'ai'
import { z } from 'zod'

import { getScriptContent } from '../readScript/getScriptContent'
import {
  addLineNumbersToContent,
  everyLineHasLineNumbers,
  extractTextFromLineNumberedContent,
} from './extractText'
import { FUZZY_THRESHOLD, fuzzySearch, getSimilarityScore } from './fuzzySearch'
import {
  emptyReplacementErrorMesssage,
  getReplacements,
} from './getReplacements'
import { prompt } from './prompt'
import { unescapeMarkers } from './unescapeMarkers'
import type { DiffResult } from './validateDiffBlock'
import { validateDiffBlock } from './validateDiffBlock'

const ERROR_MESSAGES = {
  identicalContent: `Search and replace content are identical - no changes would be made

Debug Info:
- Search and replace must be different to make changes
- Use readScript to verify the content you want to change`,
  emptySearchContent: `Empty search content is not allowed

Debug Info:
- Search content cannot be empty
- Always provide the specifig line number in :start_line: and include the content to search for`,
  failedSearch: (
    searchChunk: string,
    bestMatchSection: string,
    originalContent: string,
    bestMatchScore: number,
    threshold: number,
    lineStartNumber?: number,
  ) => {
    return `No sufficiantly good match found for the search content ${lineStartNumber ? 'at line ' + lineStartNumber : ''} (${Math.floor(bestMatchScore * 100)}% similarity, threshold is ${Math.floor(threshold * 100)}%)

Debug Info:
- Similarity Score: ${Math.floor(bestMatchScore * 100)}%
- Required Threshold: ${Math.floor(threshold * 100)}%
- Search Range: ${lineStartNumber ? 'start at line ' + lineStartNumber : 'start to end'}
- Tip: Use readScript tool to get the latest content from the script before attemting to apply diffs again.

Search Content:
${searchChunk}

Best Match Content:
${bestMatchSection}

Original Content:
${originalContent}`
  },
}

const BUFFER_LINES = 40

export const applyDiff = tool({
  description: prompt,
  inputSchema: z
    .string()
    .describe('The search/replace block defining the changes.'),
  execute: async (diffBlock) => {
    const result = validateDiffBlock(diffBlock)
    if (!result.success) {
      return {
        success: false,
        error: result.error!,
      }
    }

    const replacementBlocks = getReplacements(diffBlock)

    if (replacementBlocks.length === 0) {
      return {
        success: false,
        error: emptyReplacementErrorMesssage,
      }
    }

    const codeContent = await getScriptContent()
    const originalLineEndingCharacter = codeContent.includes('\r\n')
      ? '\r\n'
      : '\n'

    let codeLines = codeContent.split(/\r?\n/)

    let lineShift = 0
    let appliedDiffsCount = 0
    const diffResults: DiffResult[] = []

    for (const replacement of replacementBlocks) {
      let { searchContent, replaceContent } = replacement
      let startLineNumber =
        replacement.startLine + (replacement.startLine === 0 ? 0 : lineShift)

      searchContent = unescapeMarkers(searchContent)
      replaceContent = unescapeMarkers(replaceContent)

      const everyLineHasNumbering =
        (everyLineHasLineNumbers(replaceContent) &&
          everyLineHasLineNumbers(searchContent)) ||
        (everyLineHasLineNumbers(searchContent) && replaceContent.trim() === '')

      // If LLM generates numbers in searchContent, we use that as start line
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
        diffResults.push({
          success: false,
          error: ERROR_MESSAGES.identicalContent,
        })
        continue
      }

      let searchLines = searchContent === '' ? [] : searchContent.split(/\r?\n/)
      let replaceLines =
        replaceContent === '' ? [] : replaceContent.split(/\r?\n/)

      let matchIndex = -1
      let bestMatchScore = 0
      let bestMatchContent = ''

      const originalSearchContent = searchContent

      if (searchLines.length === 0) {
        diffResults.push({
          success: false,
          error: ERROR_MESSAGES.emptySearchContent,
        })
        continue
      }

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
          // expand the search range
          searchRangeStart = Math.max(0, startIndex - BUFFER_LINES)
          searchRangeEnd = Math.min(
            codeLines.length - 1,
            endIndex + BUFFER_LINES,
          )
        }
      }

      if (matchIndex === -1) {
        const fuzzySearchResult = fuzzySearch(
          codeLines,
          searchLines.join('\n'),
          searchRangeStart,
          searchRangeEnd,
        )
        matchIndex = fuzzySearchResult.bestMatchIndex
        bestMatchScore = fuzzySearchResult.bestScore
        bestMatchContent = fuzzySearchResult.bestMatchContent
      }

      // Aggressive line number stripping if no results yet
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

        const aggressiveSearchChunk = aggressiveSearchLines.join('\n')
        const aggressiveFuzzySearchResult = fuzzySearch(
          codeLines,
          aggressiveSearchChunk,
          searchRangeStart,
          searchRangeEnd,
        )

        if (
          aggressiveFuzzySearchResult.bestMatchIndex !== -1 &&
          aggressiveFuzzySearchResult.bestScore >= FUZZY_THRESHOLD
        ) {
          matchIndex = aggressiveFuzzySearchResult.bestMatchIndex
          bestMatchScore = aggressiveFuzzySearchResult.bestScore
          bestMatchContent = aggressiveFuzzySearchResult.bestMatchContent

          searchContent = aggressiveSearchContent
          replaceContent = aggressiveReplaceContent
          searchLines = aggressiveSearchLines
          replaceLines = aggressiveReplaceContent
            ? aggressiveReplaceContent.split(/\r?\n/)
            : []
        } else {
          diffResults.push({
            success: false,
            error: ERROR_MESSAGES.failedSearch(
              originalSearchContent,
              bestMatchContent ? bestMatchContent : '(no match found)',
              addLineNumbersToContent(
                codeLines
                  .slice(searchRangeStart, searchRangeEnd + 1)
                  .join('\n'),
                searchRangeStart + 1,
              ),
              bestMatchScore,
              FUZZY_THRESHOLD,
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

      const originalIndents = matchedLines.map((line) => {
        const match = line.match(/^[\t ]*/)
        return match ? match[0] : ''
      })

      const searchIndents = searchLines.map((line) => {
        const match = line.match(/^[\t ]*/)
        return match ? match[0] : ''
      })

      const indentedReplaceLines = replaceLines.map((line) => {
        const originalBaseIndent = originalIndents[0] || ''

        const currentIndentMatch = line.match(/^[\t ]*/)
        const currentIndent = currentIndentMatch ? currentIndentMatch[0] : ''

        const searchBaseIndent = searchIndents[0] || ''

        const searchBaseLevel = searchBaseIndent.length
        const currentLevel = currentIndent.length
        const indentDifference = currentLevel - searchBaseLevel

        // If relative level is negative, remove indentation from matched indent
        // If positive, add to matched indent
        const finalIndent =
          indentDifference < 0
            ? originalBaseIndent.slice(
                0,
                Math.max(0, originalBaseIndent.length + indentDifference),
              )
            : originalBaseIndent + ' '.repeat(indentDifference)

        return finalIndent + line.trim()
      })

      const beforeMatch = codeLines.slice(0, matchIndex)
      const afterMatch = codeLines.slice(matchIndex + searchLines.length)

      codeLines = [...beforeMatch, ...indentedReplaceLines, ...afterMatch]
      lineShift = lineShift - matchedLines.length + replaceLines.length
      appliedDiffsCount++
    }

    const newContent = codeLines.join(originalLineEndingCharacter)

    if (appliedDiffsCount === 0) {
      return {
        success: false,
        failParts: diffResults,
      }
    }

    return {
      success: true,
      content: newContent,
      diffResults,
    }
  },
})

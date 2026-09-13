import { distance } from 'fastest-levenshtein'

import { normalizeString } from '../../../utils/normalizeString'

/**
 * A search block has to match exactly once normalised - whitespace runs and
 * smart punctuation are folded first, so "exact" forgives reformatting but not
 * a wrong line. Lower this and edits start landing on the wrong code.
 */
export const FUZZY_THRESHOLD = 1.0

export function getSimilarityScore(original: string, search: string): number {
  if (search.length === 0) {
    return 0
  }

  const normalizedOriginal = normalizeString(original)
  const normalizedSearch = normalizeString(search)

  if (normalizedOriginal === normalizedSearch) {
    return 1
  }

  const distanceValue = distance(normalizedOriginal, normalizedSearch)
  const maxLength = Math.max(normalizedOriginal.length, normalizedSearch.length)

  return 1 - distanceValue / maxLength
}

export type FuzzyMatch = {
  bestScore: number
  bestMatchIndex: number
  bestMatchContent: string
}

/**
 * Scans outwards from the middle of the range, so when a search block appears
 * more than once the hit nearest the line the model named wins.
 */
export function fuzzySearch(
  content: string[],
  searchBlock: string,
  startIndex: number,
  endIndex: number,
): FuzzyMatch {
  let bestScore = 0
  let bestMatchIndex = -1
  let bestMatchContent = ''

  const searchLength = searchBlock.split(/\r?\n/).length

  const middleIndex = Math.floor((startIndex + endIndex) / 2)
  let leftPointer = middleIndex
  let rightPointer = middleIndex + 1

  const maxCandidateStart = endIndex - searchLength + 1

  while (leftPointer >= startIndex || rightPointer <= maxCandidateStart) {
    if (leftPointer >= startIndex) {
      const candidate = content
        .slice(leftPointer, leftPointer + searchLength)
        .join('\n')
      const score = getSimilarityScore(candidate, searchBlock)

      if (score > bestScore) {
        bestScore = score
        bestMatchIndex = leftPointer
        bestMatchContent = candidate
      }
      leftPointer--
    }

    if (rightPointer <= maxCandidateStart) {
      const candidate = content
        .slice(rightPointer, rightPointer + searchLength)
        .join('\n')
      const score = getSimilarityScore(candidate, searchBlock)

      if (score > bestScore) {
        bestScore = score
        bestMatchIndex = rightPointer
        bestMatchContent = candidate
      }
      rightPointer++
    }
  }

  return { bestScore, bestMatchIndex, bestMatchContent }
}

import { distance } from 'fastest-levenshtein'

import { normalizeString } from '../../../utils/normalizeString'

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

export function fuzzySearch(
  content: string[],
  searchBlock: string,
  startIndex: number,
  endIndex: number,
) {
  let bestScore = 0
  let bestMatchIndex = -1
  let bestMatchContent = ''

  const searchLength = searchBlock.split(/\r?\n/).length

  const middleIndex = Math.floor((startIndex + endIndex) / 2)
  let leftPointer = middleIndex
  let rightPointer = middleIndex + 1

  while (leftPointer >= startIndex || rightPointer <= endIndex - searchLength) {
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

    if (rightPointer <= endIndex - searchLength) {
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

/**
 * Common character mappings for normalization
 */
export const NORMALIZATION_MAPS = {
  // Smart quotes to regular quotes
  SMART_QUOTES: {
    '\u201C': '"', // Left double quote (U+201C)
    '\u201D': '"', // Right double quote (U+201D)
    '\u2018': "'", // Left single quote (U+2018)
    '\u2019': "'", // Right single quote (U+2019)
  },
  // Other typographic characters
  TYPOGRAPHIC: {
    '\u2026': '...', // Ellipsis
    '\u2014': '-', // Em dash
    '\u2013': '-', // En dash
    '\u00A0': ' ', // Non-breaking space
  },
}

export function normalizeString(input: string): string {
  let normalized = input

  // Apply smart quotes normalization
  for (const [char, replacement] of Object.entries(
    NORMALIZATION_MAPS.SMART_QUOTES,
  )) {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement)
  }

  // Apply typographic characters normalization
  for (const [char, replacement] of Object.entries(
    NORMALIZATION_MAPS.TYPOGRAPHIC,
  )) {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement)
  }

  // Trim leading/trailing whitespace and collapse multiple spaces
  normalized = normalized.trim().replace(/\s+/g, ' ')

  return normalized
}

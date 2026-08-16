// Some models append '>' to the SEARCH marker, so that is tolerated here.
const SEARCH_PATTERN = /^<<<<<<< SEARCH>?$/
const SEARCH_DISPLAY_STRING = '<<<<<<< SEARCH'

const REPLACE_STRING = '>>>>>>> REPLACE'
const SEPERATOR_STRING = '======='
const SEARCH_PREFIX = '<<<<<<<'
const REPLACE_PREFIX = '>>>>>>>'

const enum ParsingState {
  START,
  AFTER_SEARCH,
  AFTER_SEPERATOR,
}

export type DiffValidation =
  | { success: true }
  | { success: false; error: string }

const CORRECT_FORMAT = `<<<<<<< SEARCH
:start_line: (required) The line number of original content where the search block starts.
-------
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
`

const getInvalidDiffErrorMessage = (
  found: string,
  expected: string,
  lineNumber: number,
) => `ERROR: Diff block is invalid at line ${lineNumber}. Found "${found}", but expected "${expected}".

CORRECT FORMAT:

${CORRECT_FORMAT}`

const getLineMarkerInReplaceContentErrorMessage = (
  marker: string,
  lineNumber: number,
) => `ERROR: Invalid line marker ${marker} found in REPLACE section at line ${lineNumber}

Line Markers (:start_line: and :end_line:) are only allowed in the SEARCH section of the diff block.

CORRECT FORMAT:

${CORRECT_FORMAT}`

const getEscapedMarkerErrorMessage = (marker: string, lineNumber: number) =>
  `ERROR: Special marker "${marker}" found in diff content at line ${lineNumber}.

When the actual code contains diff markers, escape them with a leading backslash in SEARCH or REPLACE content.

CORRECT FORMAT:

<<<<<<< SEARCH
content before
\\${marker}
content after
=======
replacement content
>>>>>>> REPLACE

Escape any marker lines that appear inside the content:
\\<<<<<<< SEARCH
\\=======
\\>>>>>>> REPLACE
\\-------
`

const reportInvalidDiffError = (
  found: string,
  expected: string,
  lineNumber: number,
): DiffValidation => ({
  success: false,
  error: getInvalidDiffErrorMessage(found, expected, lineNumber),
})

const reportLineMarkerInReplaceContentError = (
  marker: string,
  lineNumber: number,
): DiffValidation => ({
  success: false,
  error: getLineMarkerInReplaceContentErrorMessage(marker, lineNumber),
})

const reportEscapedMarkerError = (
  marker: string,
  lineNumber: number,
): DiffValidation => ({
  success: false,
  error: getEscapedMarkerErrorMessage(marker, lineNumber),
})

/**
 * Walks the markers before anything is parsed, so a malformed block is reported
 * as the structural mistake it is rather than as a search that found nothing.
 */
export function validateDiffBlock(diffBlock: string): DiffValidation {
  const lines = diffBlock.split('\n')
  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    return { success: false, error: 'Diff block is empty' }
  }

  const state = {
    current: ParsingState.START,
    lineNumber: 0,
  }

  for (const line of lines) {
    state.lineNumber += 1
    const marker = line.trim()
    const isEscaped = marker.startsWith('\\')

    if (state.current === ParsingState.AFTER_SEPERATOR) {
      if (
        !isEscaped &&
        (marker.startsWith(':start_line:') || marker.startsWith(':end_line:'))
      ) {
        return reportLineMarkerInReplaceContentError(marker, state.lineNumber)
      }
    }

    switch (state.current) {
      case ParsingState.START: {
        if (marker === SEPERATOR_STRING) {
          return reportInvalidDiffError(
            SEPERATOR_STRING,
            SEARCH_DISPLAY_STRING,
            state.lineNumber,
          )
        }

        if (marker === REPLACE_STRING) {
          return reportInvalidDiffError(
            REPLACE_STRING,
            SEARCH_DISPLAY_STRING,
            state.lineNumber,
          )
        }

        if (SEARCH_PATTERN.test(marker)) {
          state.current = ParsingState.AFTER_SEARCH
        } else if (!isEscaped && marker.startsWith(SEARCH_PREFIX)) {
          return reportEscapedMarkerError(marker, state.lineNumber)
        } else if (!isEscaped && marker.startsWith(REPLACE_PREFIX)) {
          return reportEscapedMarkerError(marker, state.lineNumber)
        }
        break
      }
      case ParsingState.AFTER_SEARCH: {
        if (SEARCH_PATTERN.test(marker)) {
          return reportInvalidDiffError(
            SEARCH_DISPLAY_STRING,
            SEPERATOR_STRING,
            state.lineNumber,
          )
        }

        if (!isEscaped && marker.startsWith(SEARCH_PREFIX)) {
          return reportEscapedMarkerError(marker, state.lineNumber)
        }

        if (marker === REPLACE_STRING) {
          return reportInvalidDiffError(
            REPLACE_STRING,
            SEPERATOR_STRING,
            state.lineNumber,
          )
        }

        if (!isEscaped && marker.startsWith(REPLACE_PREFIX)) {
          return reportEscapedMarkerError(marker, state.lineNumber)
        }

        if (marker === SEPERATOR_STRING) {
          state.current = ParsingState.AFTER_SEPERATOR
        }
        break
      }
      case ParsingState.AFTER_SEPERATOR: {
        if (SEARCH_PATTERN.test(marker)) {
          return reportInvalidDiffError(
            SEARCH_DISPLAY_STRING,
            REPLACE_STRING,
            state.lineNumber,
          )
        }

        if (!isEscaped && marker.startsWith(SEARCH_PREFIX)) {
          return reportEscapedMarkerError(marker, state.lineNumber)
        }

        if (marker === SEPERATOR_STRING) {
          return reportInvalidDiffError(
            SEPERATOR_STRING,
            REPLACE_STRING,
            state.lineNumber,
          )
        }

        if (marker === REPLACE_STRING) {
          state.current = ParsingState.START
        } else if (!isEscaped && marker.startsWith(REPLACE_PREFIX)) {
          return reportEscapedMarkerError(marker, state.lineNumber)
        }
        break
      }
    }
  }

  if (state.current === ParsingState.START) {
    return { success: true }
  }

  return {
    success: false,
    error: `ERROR: Diff block is invalid or incomplete. Expected '${state.current === ParsingState.AFTER_SEARCH ? SEPERATOR_STRING : REPLACE_STRING}' at the end of the diff block.`,
  }
}

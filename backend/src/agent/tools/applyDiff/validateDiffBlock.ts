// Some LLMs append '>' at the end of SEARCH marker, so we account for that here.
const SEARCH_PATTERN = /^<<<<<<< SEARCH>?$/
const SEARCH_DISPLAY_STRING = '<<<<<<< SEARCH'

const REPLACE_STRING = '>>>>>>> REPLACE'
const SEPERATOR_STRING = '======='

const enum ParsingState {
  START,
  AFTER_SEARCH,
  AFTER_SEPERATOR,
}

const getInvalidDiffErrorMessage = (
  found: string,
  expected: string,
  lineNumber: number,
) => `ERROR: Diff block is invalid at line ${lineNumber}. Found "${found}", but expected "${expected}".

CORRECT FORMAT:

<<<<<<< SEARCH
:start_line: (required) The line number of original content where the search block starts.
-------
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
`

const getLineMarkerInReplaceContentErrorMessage = (
  marker: string,
  lineNumber: number,
) => `ERROR: Invalid line marker ${marker} found in REPLACE section at line ${lineNumber}

Line Markers (:start_line: and :end_line:) are only allowed in the SEARCH section of the diff block.

CORRECT FORMAT:

<<<<<<< SEARCH
:start_line: (required) The line number of original content where the search block starts.
-------
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
`

const reportInvalidDiffError = (
  found: string,
  expected: string,
  lineNumber: number,
) => ({
  success: false,
  error: getInvalidDiffErrorMessage(found, expected, lineNumber),
})

const reportLineMarkerInReplaceContentError = (
  marker: string,
  lineNumber: number,
) => ({
  success: false,
  error: getLineMarkerInReplaceContentErrorMessage(marker, lineNumber),
})

export function validateDiffBlock(diffBlock: string): DiffResult {
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

    if (state.current === ParsingState.AFTER_SEPERATOR) {
      if (marker === ':start_line:' || marker === ':end_line:') {
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

        if (marker === REPLACE_STRING) {
          return reportInvalidDiffError(
            REPLACE_STRING,
            SEPERATOR_STRING,
            state.lineNumber,
          )
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

        if (marker === SEPERATOR_STRING) {
          return reportInvalidDiffError(
            SEPERATOR_STRING,
            REPLACE_STRING,
            state.lineNumber,
          )
        }

        if (marker === REPLACE_STRING) {
          state.current = ParsingState.START
        }
        break
      }
    }
  }

  if (state.current === ParsingState.START) {
    return {
      success: true,
    }
  } else {
    return {
      success: false,
      error: `ERROR: Diff block is invalid or incomplete. Expected '${state.current === ParsingState.AFTER_SEARCH ? SEPERATOR_STRING : REPLACE_STRING}' at the end of the diff block.`,
    }
  }
}

export type DiffResult = {
  success: boolean
  error?: string
}

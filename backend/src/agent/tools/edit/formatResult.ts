import type { ReplacementFailure } from './applyReplacements'

export type FormatEditResultOptions = {
  displayPath: string
  appliedCount: number
  totalCount: number
  failures: ReplacementFailure[]
  linesBefore: number
  linesAfter: number
}

/**
 * Blocks that failed are reported in full even when others succeeded, because
 * the file on disk now matches neither what the model sent nor what it had
 * read - it has to see exactly which edits are still outstanding.
 */
export function formatEditResult({
  displayPath,
  appliedCount,
  totalCount,
  failures,
  linesBefore,
  linesAfter,
}: FormatEditResultOptions): string {
  if (appliedCount === 0) {
    return [
      `Error: no changes were made to ${displayPath}. ${plural(failures.length, 'block', 'blocks')} failed to apply.`,
      ...failures.map(describeFailure),
    ].join('\n\n')
  }

  const delta = linesAfter - linesBefore
  const change =
    delta === 0
      ? `still ${linesAfter} lines`
      : `${linesBefore} -> ${linesAfter} lines`

  const header = `Edited ${displayPath}: applied ${appliedCount} of ${plural(totalCount, 'block', 'blocks')} (${change}).`

  if (failures.length === 0) {
    return header
  }

  return [
    `${header}\n\n${plural(failures.length, 'block', 'blocks')} did not apply and the file was written without ${failures.length === 1 ? 'it' : 'them'}. Re-read the file before retrying, since the line numbers have moved.`,
    ...failures.map(describeFailure),
  ].join('\n\n')
}

function describeFailure(failure: ReplacementFailure): string {
  const where =
    failure.startLine === 0
      ? 'Block with no start line:'
      : `Block at line ${failure.startLine}:`

  return `${where}\n${failure.error}`
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

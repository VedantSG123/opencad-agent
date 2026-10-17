import type { CommandRun } from './runCommand'

const EMPTY_OUTPUT = '(no output)'

/**
 * What the model is told about a finished command. The exit code is only worth
 * a line when it is not zero: a successful command has nothing to explain.
 */
export function formatResult(command: string, run: CommandRun): string {
  const notes: string[] = []

  if (run.aborted) notes.push('The command was cancelled before it finished.')
  if (run.timedOut) notes.push('The command was stopped for taking too long.')
  if (run.outputTruncated) notes.push('Output was truncated.')
  if (!run.timedOut && !run.aborted && run.exitCode !== 0) {
    notes.push(`Exit code: ${run.exitCode ?? 'unknown'}`)
  }

  const output = run.output.trim() || EMPTY_OUTPUT
  return [
    `$ ${command}`,
    '',
    output,
    ...(notes.length ? ['', ...notes] : []),
  ].join('\n')
}

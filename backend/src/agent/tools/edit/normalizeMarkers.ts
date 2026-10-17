/**
 * A structural marker line, however the model spelled it, rewritten to the one
 * form the parser recognises.
 *
 * Models deform these lines in a small number of predictable ways: the run of
 * brackets comes out a character long or short, and the closing marker picks
 * up a trailing tag because several coding agents wrap this same diff format
 * in `<diff>...</diff>`. Left alone, each of those is reported as an
 * unescaped marker sitting in the content - advice that cannot fix a line
 * which was meant to be a marker all along, and which sent one session into
 * five identical retries.
 *
 * `SEARCH` and `REPLACE` are what make the loose bracket count safe to accept:
 * a line carrying the keyword is a marker, not code. The bare `=======` and
 * `-------` lines have no keyword to lean on, so only an exact-length run is
 * taken, leaving a rule of `=====` in a Markdown heading alone.
 */
const DEFORMATIONS: { pattern: RegExp; canonical: string }[] = [
  { pattern: /^\s*<{3,}\s*SEARCH\b.*$/, canonical: '<<<<<<< SEARCH' },
  { pattern: /^\s*>{3,}\s*REPLACE\b.*$/, canonical: '>>>>>>> REPLACE' },
  { pattern: /^\s*={7,}\s*$/, canonical: '=======' },
  { pattern: /^\s*-{7,}\s*$/, canonical: '-------' },
]

/** `:start_line:18`, `: start_line : 18`, and the `:end_line:` equivalents. */
const LINE_MARKER = /^\s*:\s*(start_line|end_line)\s*:\s*(\d+)\s*$/

export function normalizeMarkers(diff: string): string {
  return diff
    .split('\n')
    .map((line) => normalizeLine(line))
    .join('\n')
}

function normalizeLine(line: string): string {
  // An escaped marker is content the file itself contains, and the escape is
  // stripped later by `unescapeMarkers`. Touching it here would turn a line of
  // the file into a marker.
  if (line.trimStart().startsWith('\\')) return line

  for (const { pattern, canonical } of DEFORMATIONS) {
    if (pattern.test(line)) return canonical
  }

  const lineMarker = LINE_MARKER.exec(line)
  return lineMarker ? `:${lineMarker[1]}:${lineMarker[2]}` : line
}

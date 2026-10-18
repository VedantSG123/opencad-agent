/** What one level of indentation is written with. */
export type IndentUnit = { char: '\t' } | { char: ' '; width: number }

const DEFAULT_SPACE_WIDTH = 4

/**
 * Rebases a replacement block onto the indentation the file uses: each line
 * keeps its depth relative to the first search line.
 *
 * Depth is counted in levels, not characters, whenever a tab is involved on
 * either side. A tab and four spaces are one level apiece but one and four
 * characters, so counting characters across the two turns a nested line into
 * a tab followed by spaces - which Python rejects outright with a TabError.
 * When both sides use spaces it stays a character count, because there an
 * off-grid column (the ` * ` of a doc comment) is real and must survive.
 */
export function reindent(
  replaceLines: string[],
  searchBaseIndent: string,
  matchedBaseIndent: string,
  modelUnit: IndentUnit,
  fileUnit: IndentUnit,
): string[] {
  if (modelUnit.char === ' ' && fileUnit.char === ' ') {
    return replaceLines.map((line) =>
      rebaseByCharacters(line, searchBaseIndent, matchedBaseIndent),
    )
  }

  const base = measure(searchBaseIndent, modelUnit)
  return replaceLines.map((line) => {
    const own = measure(leadingWhitespace(line), modelUnit)
    const levels = own.levels - base.levels
    const columns = Math.max(0, own.columns - base.columns)

    const indent =
      levels >= 0
        ? matchedBaseIndent + unitString(fileUnit).repeat(levels)
        : dropLevels(matchedBaseIndent, -levels, fileUnit)

    return indent + ' '.repeat(columns) + line.trim()
  })
}

function rebaseByCharacters(
  line: string,
  searchBaseIndent: string,
  matchedBaseIndent: string,
): string {
  const difference = leadingWhitespace(line).length - searchBaseIndent.length

  const indent =
    difference < 0
      ? matchedBaseIndent.slice(
          0,
          Math.max(0, matchedBaseIndent.length + difference),
        )
      : matchedBaseIndent + ' '.repeat(difference)

  return indent + line.trim()
}

/**
 * The unit a run of lines is indented in.
 *
 * Tabs win when a tab leads more lines than spaces do. Lines led by a single
 * space are not counted for either side: that is a doc comment's ` * `
 * alignment, and a tab-indented file full of top-level doc comments would
 * otherwise be mistaken for a space-indented one.
 */
export function detectIndentUnit(lines: string[]): IndentUnit {
  let tabLed = 0
  let spaceLed = 0
  for (const line of lines) {
    if (line.trim() === '') continue
    const indent = leadingWhitespace(line)
    if (indent.startsWith('\t')) tabLed++
    else if (indent.length >= 2) spaceLed++
  }

  if (tabLed > spaceLed) return { char: '\t' }
  return { char: ' ', width: commonSpaceStep(lines) }
}

/**
 * The indentation right where the edit lands is the best evidence of how the
 * file is indented there, so it decides when it says anything. The whole file
 * is only consulted for a match at the margin, which carries no indentation.
 */
export function fileIndentUnitAt(
  matchedBaseIndent: string,
  fileLines: string[],
): IndentUnit {
  if (matchedBaseIndent.startsWith('\t')) return { char: '\t' }
  if (matchedBaseIndent.length > 0) {
    return { char: ' ', width: commonSpaceStep(fileLines) }
  }
  return detectIndentUnit(fileLines)
}

/**
 * The step most often taken between consecutive indented lines. The most
 * common rather than the smallest, so a doc comment's one-column offset does
 * not get read as a one-space indent.
 */
function commonSpaceStep(lines: string[]): number {
  const counts = new Map<number, number>()
  let previous: number | null = null

  for (const line of lines) {
    if (line.trim() === '') continue
    const width = leadingWhitespace(line).length
    if (previous !== null) {
      const step = Math.abs(width - previous)
      if (step > 0) counts.set(step, (counts.get(step) ?? 0) + 1)
    }
    previous = width
  }

  let best = DEFAULT_SPACE_WIDTH
  let bestCount = 0
  for (const [step, count] of counts) {
    if (count > bestCount || (count === bestCount && step < best)) {
      best = step
      bestCount = count
    }
  }
  return best
}

/** Whole levels in `unit`, and the columns of alignment past the last one. */
function measure(
  indent: string,
  unit: IndentUnit,
): { levels: number; columns: number } {
  if (unit.char === '\t') {
    const tabs = indent.match(/^\t*/)?.[0].length ?? 0
    return { levels: tabs, columns: indent.length - tabs }
  }
  return {
    levels: Math.floor(indent.length / unit.width),
    columns: indent.length % unit.width,
  }
}

function unitString(unit: IndentUnit): string {
  return unit.char === '\t' ? '\t' : ' '.repeat(unit.width)
}

function dropLevels(indent: string, levels: number, unit: IndentUnit): string {
  const step = unitString(unit)
  let result = indent
  for (let index = 0; index < levels && result.endsWith(step); index++) {
    result = result.slice(0, -step.length)
  }
  return result
}

export function leadingWhitespace(line: string | undefined): string {
  return line?.match(/^[\t ]*/)?.[0] ?? ''
}

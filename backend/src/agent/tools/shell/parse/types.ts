/**
 * A command line broken into the individual commands a shell would run, with
 * the constructs that make token analysis untrustworthy flagged separately.
 */
export type ParsedCommand = {
  /** One entry per command in the chain, split on `&&`, `||`, `;`, `|` and `&`. */
  segments: string[][]
  sawSubstitution: boolean
  sawRedirection: boolean
}

export type ParseResult =
  | { ok: true; parsed: ParsedCommand }
  | { ok: false; reason: string }

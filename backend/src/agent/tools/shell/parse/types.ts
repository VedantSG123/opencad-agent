/**
 * A command line broken into the individual commands a shell would run, with
 * the constructs that make token analysis untrustworthy flagged separately.
 */
export type ParsedCommand = {
  /** One entry per command in the chain, split on `&&`, `||`, `;`, `|` and `&`. */
  segments: string[][]
  sawSubstitution: boolean
  sawRedirection: boolean
  /**
   * Whether the segments describe what the shell will really run. A heredoc
   * body is tokenized as though it were shell, and a leading `VAR=value` reads
   * as the program, so neither may be turned into a stored rule - though both
   * may still run once the user approves them.
   */
  tokensAreFaithful: boolean
}

export type ParseResult =
  | { ok: true; parsed: ParsedCommand }
  | { ok: false; reason: string }

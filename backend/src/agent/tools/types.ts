import type { PathGuard } from '../permissions/pathGuard'

export type ToolContext = {
  /** Absolute path to the project directory the agent is allowed to work in. */
  workingDirectory: string
  /**
   * Decides what may actually be opened, asked after the path is resolved.
   * Defaults to the project directory alone when absent, so a caller that
   * wires up no policy still gets containment.
   */
  permissions?: PathGuard
}

/**
 * The slice of `RunPermissions` a toolset needs. Narrow on purpose: building
 * tools must not be able to reach the grant stores, only the guards.
 */
export type ToolPermissions = {
  projectDirectory: string
  guardFor(tool: string): PathGuard
}

/**
 * Whether a tool's output says the call failed.
 *
 * Tools answer failure in prose rather than by throwing, so the model reads a
 * sentence it can act on instead of the run ending. That leaves the word
 * "Error" as the only thing separating a refusal from a result, and every
 * failure path in every tool opens with it - `toolset.test.ts` holds them to
 * it. Without this the agent loop records a rejected edit as a completed one,
 * which is how five straight failures once looked like five successes.
 */
export function toolFailed(output: string): boolean {
  return /^Error\b/.test(output)
}

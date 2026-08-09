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

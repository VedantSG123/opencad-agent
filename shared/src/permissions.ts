import type { PermissionAccess, PermissionMatch } from './projectPreferences.js'

export type PermissionScope = 'once' | 'session' | 'project'

/** A rule before it has an identity - what a user's choice would record. */
export type RuleTemplate = {
  tool: string
  match: PermissionMatch
}

/** Something a tool call would touch, weighed before the call runs. */
export type ToolAccess =
  | { kind: 'path'; path: string; access: PermissionAccess }
  | { kind: 'command'; command: string }

export type PermissionChoice = {
  scope: PermissionScope
  label: string
  /** Absent for `once`, which records no rule. */
  rule?: RuleTemplate
}

/** The question put to the user when the rules cannot settle a tool call. */
export type PermissionRequest = {
  tool: string
  access: ToolAccess
  title: string
  /** What is being asked about, resolved: an absolute path, or the full command. */
  subject: string
  /** Why the call was stopped, or why the offer is narrower than usual. */
  explanation?: string
  /**
   * Only these may be shown. A command that cannot be generalised safely is
   * offered no `project` scope, and a UI that renders a fixed set of buttons
   * would put one there.
   */
  choices: PermissionChoice[]
}

/** The payload of the `data-permission` part on the agent stream. */
export type PermissionPrompt = {
  toolCallId: string
  request: PermissionRequest
  /** Set once answered, so a reconnecting client does not re-ask. */
  answered?: PermissionScope | null
  /**
   * The question went unanswered long enough that the run gave up on it. The
   * call was refused either way, but nobody chose to refuse it - worth saying
   * differently, or the panel accuses the user of a decision they never made.
   */
  expired?: boolean
}

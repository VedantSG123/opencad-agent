import type { PermissionAccess } from 'shared'

import type { PermissionScope, RuleTemplate } from '../rules/types'

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
  /** Why the offer is narrower than usual, when it is. */
  explanation?: string
  choices: PermissionChoice[]
}

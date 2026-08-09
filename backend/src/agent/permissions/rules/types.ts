import type { PermissionMatch } from 'shared'

/** Which store a granted rule goes to. */
export type PermissionScope = 'once' | 'session' | 'project'

/** A rule before it has an identity - what a user's choice would record. */
export type RuleTemplate = {
  tool: string
  match: PermissionMatch
}

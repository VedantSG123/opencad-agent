import type { PermissionAccess, PermissionRule } from 'shared'

import { isWithin } from '../../../utils/paths'

export function ruleAppliesToTool(rule: PermissionRule, tool: string): boolean {
  return rule.tool === '*' || rule.tool === tool
}

/**
 * Write access implies read access, so granting a directory for editing does
 * not prompt again on the next read. Denial runs the other way: refusing reads
 * refuses writes too.
 */
export function pathRuleCovers(
  rule: PermissionRule,
  absolutePath: string,
  requested: PermissionAccess,
): boolean {
  if (rule.match.kind !== 'pathPrefix') return false
  if (!isWithin(rule.match.path, absolutePath)) return false

  return rule.decision === 'allow'
    ? rule.match.access === requested || rule.match.access === 'write'
    : rule.match.access === requested || rule.match.access === 'read'
}

export function commandRuleCovers(
  rule: PermissionRule,
  command: string,
): boolean {
  if (rule.match.kind !== 'commandPrefix') return false

  const prefix = rule.match.prefix.trim()
  if (prefix === '') return false

  const normalized = command.trim()
  return (
    normalized === prefix ||
    normalized.startsWith(`${prefix} `) ||
    normalized.startsWith(`${prefix}\t`)
  )
}

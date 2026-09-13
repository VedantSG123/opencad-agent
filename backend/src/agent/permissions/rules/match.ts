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

/**
 * Compares whole tokens, so a rule for `bun add` cannot stretch to cover
 * `bun adduser`, and one for `bun` cannot cover `bunx`.
 */
export function commandHeadRuleCovers(
  rule: PermissionRule,
  tokens: readonly string[],
): boolean {
  if (rule.match.kind !== 'commandHead') return false

  const head = rule.match.tokens
  if (head.length === 0 || head.length > tokens.length) return false

  return head.every((token, index) => token === tokens[index])
}

export function commandExactRuleCovers(
  rule: PermissionRule,
  command: string,
): boolean {
  if (rule.match.kind !== 'commandExact') return false

  return rule.match.command.trim() === command.trim()
}

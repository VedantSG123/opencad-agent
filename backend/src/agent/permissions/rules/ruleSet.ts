import type { PermissionRule } from 'shared'

/** Adds a rule unless one covering exactly the same thing is already stored. */
export function addRule(
  rules: PermissionRule[],
  rule: PermissionRule,
): PermissionRule[] {
  return rules.some((existing) => isSameRule(existing, rule))
    ? rules
    : [...rules, rule]
}

export function isSameRule(
  left: PermissionRule,
  right: PermissionRule,
): boolean {
  if (left.tool !== right.tool || left.decision !== right.decision) return false
  if (left.match.kind !== right.match.kind) return false

  if (left.match.kind === 'pathPrefix' && right.match.kind === 'pathPrefix') {
    return (
      left.match.path === right.match.path &&
      left.match.access === right.match.access
    )
  }
  if (
    left.match.kind === 'commandPrefix' &&
    right.match.kind === 'commandPrefix'
  ) {
    return left.match.prefix === right.match.prefix
  }

  return false
}

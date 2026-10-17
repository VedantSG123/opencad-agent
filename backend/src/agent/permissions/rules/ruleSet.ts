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
  if (left.match.kind === 'commandHead' && right.match.kind === 'commandHead') {
    const leftTokens = left.match.tokens
    const rightTokens = right.match.tokens
    return (
      leftTokens.length === rightTokens.length &&
      leftTokens.every((token, index) => token === rightTokens[index])
    )
  }
  if (
    left.match.kind === 'commandExact' &&
    right.match.kind === 'commandExact'
  ) {
    return left.match.command === right.match.command
  }

  return false
}

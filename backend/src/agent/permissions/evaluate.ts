import path from 'node:path'

import type { PermissionAccess, PermissionRule } from 'shared'

import { isWithin } from '../../utils/paths'
import { deniedPathReason } from './builtin/deniedPaths'
import type { ToolAccess } from './request/types'
import {
  commandExactRuleCovers,
  commandHeadRuleCovers,
  pathRuleCovers,
  ruleAppliesToTool,
} from './rules/match'

export type PolicyDecision = 'allow' | 'ask' | 'deny'

export type EvaluationContext = {
  tool: string
  projectDirectory: string
  rules: PermissionRule[]
}

export function evaluateAccess(
  access: ToolAccess,
  context: EvaluationContext,
): PolicyDecision {
  return access.kind === 'path'
    ? evaluatePath(access.path, access.access, context)
    : evaluateCommand(access.command, context)
}

/** The strictest decision across everything a single tool call would touch. */
export function evaluateAccesses(
  accesses: ToolAccess[],
  context: EvaluationContext,
): PolicyDecision {
  let decision: PolicyDecision = 'allow'

  for (const access of accesses) {
    const next = evaluateAccess(access, context)
    if (next === 'deny') return 'deny'
    if (next === 'ask') decision = 'ask'
  }

  return decision
}

function evaluatePath(
  requestedPath: string,
  access: PermissionAccess,
  context: EvaluationContext,
): PolicyDecision {
  const absolute = path.resolve(context.projectDirectory, requestedPath)

  if (deniedPathReason(absolute)) return 'deny'

  const applicable = context.rules.filter((rule) =>
    ruleAppliesToTool(rule, context.tool),
  )

  if (
    applicable.some(
      (rule) =>
        rule.decision === 'deny' && pathRuleCovers(rule, absolute, access),
    )
  ) {
    return 'deny'
  }
  if (
    applicable.some(
      (rule) =>
        rule.decision === 'allow' && pathRuleCovers(rule, absolute, access),
    )
  ) {
    return 'allow'
  }

  return isWithin(context.projectDirectory, absolute) ? 'allow' : 'ask'
}

function evaluateCommand(
  command: string,
  context: EvaluationContext,
): PolicyDecision {
  // Placeholder until the shell parsers land: quoting and operators are ignored,
  // so only unquoted single commands tokenize correctly here.
  const tokens = command.trim().split(/\s+/).filter(Boolean)

  const applicable = context.rules.filter((rule) =>
    ruleAppliesToTool(rule, context.tool),
  )

  const covers = (rule: PermissionRule): boolean =>
    commandHeadRuleCovers(rule, tokens) || commandExactRuleCovers(rule, command)

  if (applicable.some((rule) => rule.decision === 'deny' && covers(rule))) {
    return 'deny'
  }
  if (applicable.some((rule) => rule.decision === 'allow' && covers(rule))) {
    return 'allow'
  }

  // Commands carry no containing boundary the way paths do, so an unrecognised
  // one is always the user's call.
  return 'ask'
}

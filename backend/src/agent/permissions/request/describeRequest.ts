import path from 'node:path'

import { containingDirectory } from '../../../utils/paths'
import { isOpaqueHead } from '../builtin/opaqueCommands'
import type { AccessVerdict, EvaluationContext } from '../evaluate'
import { headWouldAllowEverything } from '../evaluate'
import type { RuleTemplate } from '../rules/types'
import type { PermissionChoice, PermissionRequest, ToolAccess } from './types'

export function describeRequest(
  access: ToolAccess,
  context: EvaluationContext,
  verdict?: AccessVerdict,
): PermissionRequest {
  return access.kind === 'path'
    ? describePathRequest(access, context)
    : describeCommandRequest(access, context, verdict)
}

/** A word that could name a subcommand: not a flag, a path, or an assignment. */
function isPlainWord(token: string): boolean {
  return /^[a-z][\w:-]*$/i.test(token)
}

/**
 * The words a command grant should cover: the subcommand when there is one
 * (`bun add left-pad` → `bun add`), otherwise the program alone.
 *
 * It stops at two words on purpose. Taking every plain word would record
 * `bun add left-pad`, which asks again for the next package and grants nothing
 * useful.
 *
 * `null` when no honest generalisation exists, and the command may only be
 * granted as itself.
 */
export function suggestedCommandHead(
  tokens: readonly string[],
): string[] | null {
  const [program, second] = tokens
  // A program named by a variable stands for whatever the environment says at
  // the time, so there is nothing here worth remembering.
  if (!program || program.includes('$')) return null

  if (second === undefined) return [program]
  if (isPlainWord(second)) return [program, second]

  // A flag or a path in second place usually means the program is the whole
  // verb, as in `ls -la`. But a flag may also be taking a value and hiding the
  // real subcommand behind it - `git -C /tmp status` - and there the program
  // alone would be a rule covering every git command there is. A plain word
  // further along is the tell, and it is not worth guessing which one it is.
  return tokens.slice(2).some(isPlainWord) ? null : [program]
}

export function choiceForScope(
  request: PermissionRequest,
  scope: PermissionChoice['scope'],
): PermissionChoice | undefined {
  return request.choices.find((choice) => choice.scope === scope)
}

function describePathRequest(
  access: Extract<ToolAccess, { kind: 'path' }>,
  context: EvaluationContext,
): PermissionRequest {
  const absolute = path.resolve(context.projectDirectory, access.path)
  const directory = containingDirectory(absolute)
  const verb = access.access === 'write' ? 'write to' : 'read'

  const rule: RuleTemplate = {
    tool: context.tool,
    match: { kind: 'pathPrefix', path: directory, access: access.access },
  }

  return {
    tool: context.tool,
    access,
    title: `Allow the agent to ${verb} files outside the project?`,
    subject: absolute,
    choices: [
      { scope: 'once', label: 'Allow once' },
      { scope: 'session', label: `Allow ${directory} for this session`, rule },
      {
        scope: 'project',
        label: `Always allow ${directory} in this project`,
        rule,
      },
    ],
  }
}

/**
 * Which grants are on offer narrows twice. A command the parser could not read
 * plainly, or one on the dangerous list, may only ever be allowed once. A
 * command whose head names a program that runs whatever it is given may be
 * remembered, but only as itself and only for this session - `node` as a rule
 * would stand for every `node -e` that follows.
 */
function describeCommandRequest(
  access: Extract<ToolAccess, { kind: 'command' }>,
  context: EvaluationContext,
  verdict?: AccessVerdict,
): PermissionRequest {
  const command = access.command.trim()
  const choices: PermissionChoice[] = [{ scope: 'once', label: 'Allow once' }]

  if (verdict?.mayBeRemembered !== false) {
    const head = suggestedCommandHead(
      verdict?.command?.decidingSegment ?? command.split(/\s+/),
    )
    const settlesEverything =
      head === null ||
      verdict?.command === undefined ||
      headWouldAllowEverything(head, verdict.command.segments, context)

    if (head && !isOpaqueHead(head) && settlesEverything) {
      const rule: RuleTemplate = {
        tool: context.tool,
        match: { kind: 'commandHead', tokens: head },
      }
      const shown = head.join(' ')
      choices.push(
        {
          scope: 'session',
          label: `Allow \`${shown}\` for this session`,
          rule,
        },
        {
          scope: 'project',
          label: `Always allow \`${shown}\` in this project`,
          rule,
        },
      )
    } else {
      choices.push({
        scope: 'session',
        label: `Allow exactly this command for this session`,
        rule: {
          tool: context.tool,
          match: { kind: 'commandExact', command },
        },
      })
    }
  }

  return {
    tool: context.tool,
    access,
    title: 'Allow the agent to run this command?',
    subject: access.command,
    // Shown whenever there is one, not only when the offer narrowed: a command
    // stopped for a file it names looks arbitrary without it, and the command
    // on its own does not say which of its words caused the question.
    explanation: verdict?.reason,
    choices,
  }
}

import path from 'node:path'

import { containingDirectory } from '../../../utils/paths'
import type { RuleTemplate } from '../rules/types'
import type { PermissionChoice, PermissionRequest, ToolAccess } from './types'

export function describeRequest(
  access: ToolAccess,
  context: { tool: string; projectDirectory: string },
): PermissionRequest {
  return access.kind === 'path'
    ? describePathRequest(access, context)
    : describeCommandRequest(access, context)
}

/**
 * The prefix a command grant should cover: the subcommand when there is one
 * (`bun add left-pad` → `bun add`), otherwise the program alone. A flag or path
 * as the second word means the first word already is the whole verb.
 */
export function suggestedCommandPrefix(command: string): string {
  const [program, second] = command.trim().split(/\s+/)
  if (!program) return command.trim()

  const isSubcommand =
    second !== undefined &&
    /^[a-z][\w:-]*$/i.test(second) &&
    !second.includes('.')

  return isSubcommand ? `${program} ${second}` : program
}

export function choiceForScope(
  request: PermissionRequest,
  scope: PermissionChoice['scope'],
): PermissionChoice | undefined {
  return request.choices.find((choice) => choice.scope === scope)
}

function describePathRequest(
  access: Extract<ToolAccess, { kind: 'path' }>,
  context: { tool: string; projectDirectory: string },
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

function describeCommandRequest(
  access: Extract<ToolAccess, { kind: 'command' }>,
  context: { tool: string; projectDirectory: string },
): PermissionRequest {
  const prefix = suggestedCommandPrefix(access.command)

  const rule: RuleTemplate = {
    tool: context.tool,
    match: { kind: 'commandPrefix', prefix },
  }

  return {
    tool: context.tool,
    access,
    title: 'Allow the agent to run this command?',
    subject: access.command,
    choices: [
      { scope: 'once', label: 'Allow once' },
      { scope: 'session', label: `Allow \`${prefix}\` for this session`, rule },
      {
        scope: 'project',
        label: `Always allow \`${prefix}\` in this project`,
        rule,
      },
    ],
  }
}

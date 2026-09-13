import path from 'node:path'

import type { PermissionRule } from 'shared'

import type { RuleTemplate } from './types'

export function buildRule(
  template: RuleTemplate,
  id: string,
  createdAt: string,
): PermissionRule {
  return {
    id,
    tool: template.tool,
    match:
      template.match.kind === 'pathPrefix'
        ? { ...template.match, path: path.resolve(template.match.path) }
        : template.match,
    decision: 'allow',
    createdAt,
  }
}

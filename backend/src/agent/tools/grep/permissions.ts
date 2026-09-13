import type { ToolAccess } from '../../permissions/request/types'
import { grepInputSchema } from './index'

export function describeGrepAccess(input: unknown): ToolAccess[] {
  const parsed = grepInputSchema.safeParse(input)
  if (!parsed.success) return []

  // No `path` means the whole project, which the project directory itself
  // stands for.
  return [{ kind: 'path', path: parsed.data.path ?? '.', access: 'read' }]
}

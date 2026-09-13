import type { ToolAccess } from '../../permissions/request/types'
import { readInputSchema } from './index'

export function describeReadAccess(input: unknown): ToolAccess[] {
  const parsed = readInputSchema.safeParse(input)
  // Malformed input never reaches the filesystem: the tool rejects it itself,
  // so there is no access to weigh.
  if (!parsed.success) return []

  return [{ kind: 'path', path: parsed.data.path, access: 'read' }]
}

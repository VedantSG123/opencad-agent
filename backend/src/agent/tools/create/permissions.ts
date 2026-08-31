import type { ToolAccess } from '../../permissions/request/types'
import { createInputSchema } from './index'

export function describeCreateAccess(input: unknown): ToolAccess[] {
  const parsed = createInputSchema.safeParse(input)
  // Malformed input never reaches the filesystem: the tool rejects it itself,
  // so there is no access to weigh.
  if (!parsed.success) return []

  return [{ kind: 'path', path: parsed.data.path, access: 'write' }]
}

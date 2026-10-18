import type { ToolAccess } from '../../permissions/request/types'
import { shellInputSchema } from './index'

export function describeShellAccess(input: unknown): ToolAccess[] {
  const parsed = shellInputSchema.safeParse(input)
  if (!parsed.success) return []

  return [{ kind: 'command', command: parsed.data.command }]
}

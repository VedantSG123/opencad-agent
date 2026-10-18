import { isToolUIPart } from 'ai'

import type { AgentUIMessage, AgentUIPart } from '@/types/agent'

export interface Turn {
  /** Everything up to the last reasoning or tool part, narration included. */
  work: AgentUIPart[]
  /** The text after the last of those: what the turn concluded. */
  answer: AgentUIPart[]
  toolCalls: number
}

export function splitTurn(message: AgentUIMessage): Turn {
  const parts = message.parts
  let lastWork = parts.length - 1
  while (
    lastWork >= 0 &&
    parts[lastWork].type !== 'reasoning' &&
    !isToolUIPart(parts[lastWork])
  ) {
    lastWork--
  }
  const work = parts.slice(0, lastWork + 1)
  return {
    work,
    answer: parts.slice(lastWork + 1),
    toolCalls: work.filter(isToolUIPart).length,
  }
}

export function railLabel(
  turn: Turn,
  message: AgentUIMessage,
  isLive: boolean,
): string {
  const steps = turn.toolCalls === 1 ? '1 step' : `${turn.toolCalls} steps`

  if (isLive) return turn.toolCalls === 0 ? 'Thinking' : `Working · ${steps}`

  const { created, completed } = message.metadata ?? {}
  const took =
    created && completed
      ? formatDuration(Date.parse(completed) - Date.parse(created))
      : null

  if (turn.toolCalls === 0) return took ? `Thought for ${took}` : 'Thought'
  return took ? `Completed ${steps} in ${took}` : `Completed ${steps}`
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

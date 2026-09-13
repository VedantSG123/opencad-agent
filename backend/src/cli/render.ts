import type { AgentEvent } from '../agent/events'
import {
  CREATE_TOOL_NAME,
  EDIT_TOOL_NAME,
  GET_API_DOCUMENTATION_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_TOOL_NAME,
  SHELL_TOOL_NAME,
} from '../agent/tools/names'

const DIM = '\u001b[2m'
const BOLD = '\u001b[1m'
const RED = '\u001b[31m'
const YELLOW = '\u001b[33m'
const CYAN = '\u001b[36m'
const RESET = '\u001b[0m'

export const style = {
  dim: (text: string) => `${DIM}${text}${RESET}`,
  bold: (text: string) => `${BOLD}${text}${RESET}`,
  red: (text: string) => `${RED}${text}${RESET}`,
  yellow: (text: string) => `${YELLOW}${text}${RESET}`,
  cyan: (text: string) => `${CYAN}${text}${RESET}`,
}

/**
 * Prints a run as it happens. It tracks whether the cursor is mid-line,
 * because text arrives as deltas with no newline of their own and a tool line
 * printed on top of them would run the two together.
 */
export function createRenderer() {
  let midLine = false

  const write = (text: string) => {
    process.stdout.write(text)
    midLine = !text.endsWith('\n')
  }

  const breakLine = () => {
    if (midLine) write('\n')
  }

  return {
    onEvent: (event: AgentEvent): void => {
      switch (event.type) {
        case 'text-start':
          breakLine()
          break
        case 'text-delta':
          write(event.text)
          break
        case 'text-end':
          breakLine()
          break
        case 'tool-start':
          breakLine()
          write(
            `  ${style.cyan('*')} ${style.bold(event.part.tool)} ${style.dim(describeToolCall(event.part.tool, event.part.state.input))}\n`,
          )
          break
        case 'tool-end':
          if (event.part.state.state === 'error') {
            write(`    ${style.red(firstLine(event.part.state.error))}\n`)
            break
          }
          if (event.part.state.state === 'completed') {
            write(`    ${style.dim(summarise(event.part.state.output))}\n`)
          }
          break
        case 'tool-denied':
          write(`    ${style.yellow(firstLine(event.reason))}\n`)
          break
        case 'assistant-end':
          breakLine()
          break
      }
    },
    breakLine,
  }
}

/** The one thing about a call worth showing on the line that announces it. */
export function describeToolCall(tool: string, input: unknown): string {
  const values = (input ?? {}) as Record<string, unknown>

  switch (tool) {
    case READ_TOOL_NAME:
    case EDIT_TOOL_NAME:
    case CREATE_TOOL_NAME:
      return field(values.path)
    case GREP_TOOL_NAME:
      return [field(values.pattern), field(values.path)]
        .filter(Boolean)
        .join('  ')
    case SHELL_TOOL_NAME:
      return field(values.command)
    case GET_API_DOCUMENTATION_TOOL_NAME:
      return `${field(values.entityType)} ${field(values.entityName)}`.trim()
    default:
      return firstLine(JSON.stringify(values))
  }
}

/** Tool input reaches here unvalidated, so a non-string field shows as blank. */
function field(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function summarise(output: string): string {
  const lines = output.split('\n')
  const head = lines[0]?.trim() ?? ''
  const rest = lines.length - 1
  const shown = head.length > 100 ? `${head.slice(0, 100)}...` : head
  return rest > 0 ? `${shown} (+${rest} more lines)` : shown
}

function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.length > 160 ? `${line.slice(0, 160)}...` : line
}

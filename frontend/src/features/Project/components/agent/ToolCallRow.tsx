import { Disclosure } from '@heroui/react'
import {
  Add01Icon,
  AlertCircleIcon,
  BookOpen01Icon,
  Clock01Icon,
  CommandLineIcon,
  File02Icon,
  Loading02Icon,
  PencilEdit02Icon,
  Search01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import { getToolOrDynamicToolName } from 'ai'
import type { PermissionPrompt as Prompt } from 'shared'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'

import { PermissionPrompt } from './PermissionPrompt'

const TOOLS: Record<string, { label: string; icon: IconSvgElement }> = {
  read: { label: 'Read', icon: File02Icon },
  grep: { label: 'Search', icon: Search01Icon },
  edit: { label: 'Edit', icon: PencilEdit02Icon },
  create: { label: 'Create', icon: Add01Icon },
  shell: { label: 'Run', icon: CommandLineIcon },
  getApiDocumentation: { label: 'Docs', icon: BookOpen01Icon },
}

type ToolPart = ToolUIPart | DynamicToolUIPart

interface ToolCallRowProps {
  sessionId: string
  part: ToolPart
  permission?: Prompt
}

export function ToolCallRow({ sessionId, part, permission }: ToolCallRowProps) {
  const tool = getToolOrDynamicToolName(part)
  const awaitingAnswer =
    permission !== undefined && permission.answered === undefined
  const detail =
    part.state === 'output-error'
      ? part.errorText
      : part.state === 'output-available'
        ? outputText(part.output)
        : null

  const { label, icon } = TOOLS[tool] ?? { label: tool, icon: Wrench01Icon }
  const subject = describeCall(tool, part.input)

  return (
    <div className='flex flex-col'>
      <Disclosure isDisabled={!detail}>
        <Disclosure.Heading>
          <Disclosure.Trigger className='group -ml-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-foreground/70 transition-colors hover:bg-muted/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:hover:bg-transparent'>
            <StatusIcon
              state={part.state}
              awaitingAnswer={awaitingAnswer}
              icon={icon}
            />
            <span className='shrink-0'>{label}</span>
            {subject && (
              <span
                title={subject.full}
                className='min-w-0 truncate rounded border border-separator px-1 py-px font-mono text-[11px] text-foreground/80'
              >
                {subject.short}
              </span>
            )}
            {detail && (
              <Disclosure.Indicator className='ml-auto h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-aria-expanded:opacity-100' />
            )}
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <pre
            className={cn(
              'mt-1 mb-1 max-h-64 overflow-auto rounded-md bg-muted/10 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all',
              part.state === 'output-error'
                ? 'text-danger'
                : 'text-foreground/70',
            )}
          >
            {detail}
          </pre>
        </Disclosure.Content>
      </Disclosure>
      {permission && (
        <PermissionPrompt sessionId={sessionId} prompt={permission} />
      )}
    </div>
  )
}

function StatusIcon({
  state,
  awaitingAnswer,
  icon,
}: {
  state: ToolPart['state']
  awaitingAnswer: boolean
  icon: IconSvgElement
}) {
  if (awaitingAnswer) {
    return (
      <Icon icon={Clock01Icon} size={13} className='shrink-0 text-warning' />
    )
  }
  switch (state) {
    case 'output-available':
      return <Icon icon={icon} size={13} className='shrink-0' />
    case 'output-error':
    case 'output-denied':
      return (
        <Icon
          icon={AlertCircleIcon}
          size={13}
          className='shrink-0 text-danger'
        />
      )
    default:
      return (
        <Icon
          icon={Loading02Icon}
          size={13}
          className='shrink-0 animate-spin text-muted'
        />
      )
  }
}

/** What the call acted on, as the CLI summarises it (`backend/src/cli/render.ts`). */
function describeCall(
  tool: string,
  input: unknown,
): { short: string; full: string } | null {
  const values = (input ?? {}) as Record<string, unknown>
  switch (tool) {
    case 'read':
    case 'edit':
    case 'create': {
      const path = field(values.path)
      return path ? { short: fileName(path), full: path } : null
    }
    case 'grep': {
      const pattern = field(values.pattern)
      const where = field(values.path)
      return pattern
        ? { short: pattern, full: where ? `${pattern} in ${where}` : pattern }
        : null
    }
    case 'shell': {
      const command = field(values.command)
      return command ? { short: command, full: command } : null
    }
    case 'getApiDocumentation': {
      const name =
        `${field(values.entityType)} ${field(values.entityName)}`.trim()
      return name ? { short: name, full: name } : null
    }
    default: {
      const json = JSON.stringify(values)
      return json === '{}' ? null : { short: json, full: json }
    }
  }
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

function field(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function outputText(output: unknown): string | null {
  if (output === undefined || output === '') return null
  return typeof output === 'string' ? output : JSON.stringify(output, null, 2)
}

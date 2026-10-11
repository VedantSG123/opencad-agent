import * as React from 'react'

import { cn } from '@/lib/utils'

export type ExportFormat = {
  id: string
  label: string
  /** File extension, without the dot. */
  ext: string
  description: string
  /** Formats sharing a group are listed together under its name, in order. */
  group: string
}

/**
 * The format picker, shared by every kernel's export dialog.
 *
 * Which formats exist is the kernel's business; how choosing one looks is not.
 * A dense radio list rather than cards: there can be nine formats, and the
 * extension column is what people scan for.
 */
export function ExportFormatList({
  formats,
  selected,
  onSelect,
  isDisabled = false,
}: {
  formats: ExportFormat[]
  selected: string
  onSelect: (id: string) => void
  isDisabled?: boolean
}) {
  const name = React.useId()

  const groups = new Map<string, ExportFormat[]>()
  for (const format of formats) {
    groups.set(format.group, [...(groups.get(format.group) ?? []), format])
  }

  return (
    <fieldset
      disabled={isDisabled}
      className='group flex flex-col gap-3 disabled:opacity-60'
    >
      <legend className='sr-only'>File format</legend>
      {[...groups].map(([group, items]) => (
        <div key={group} className='flex flex-col gap-1.5'>
          <div className='text-xs font-medium text-muted'>{group}</div>
          <div className='divide-y divide-separator overflow-hidden rounded-md border border-border'>
            {items.map((format) => {
              const isActive = selected === format.id
              return (
                <label
                  key={format.id}
                  className={cn(
                    'grid cursor-pointer grid-cols-[0.875rem_minmax(0,1fr)_auto] items-start gap-x-3 px-3 py-2 transition-colors duration-150',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus',
                    'group-disabled:cursor-default',
                    isActive
                      ? 'bg-accent-soft'
                      : 'hover:bg-default group-disabled:hover:bg-transparent',
                  )}
                >
                  <input
                    type='radio'
                    name={name}
                    value={format.id}
                    checked={isActive}
                    onChange={() => onSelect(format.id)}
                    className='sr-only'
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'mt-[3px] grid size-3.5 place-items-center rounded-full border',
                      isActive ? 'border-accent' : 'border-muted/60',
                    )}
                  >
                    {isActive && (
                      <span className='size-1.5 rounded-full bg-accent' />
                    )}
                  </span>
                  <span className='flex min-w-0 flex-col gap-0.5'>
                    <span className='text-sm font-medium text-foreground'>
                      {format.label}
                    </span>
                    <span className='text-xs leading-snug text-muted'>
                      {format.description}
                    </span>
                  </span>
                  <span className='pt-0.5 font-mono text-xs text-muted'>
                    .{format.ext}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </fieldset>
  )
}

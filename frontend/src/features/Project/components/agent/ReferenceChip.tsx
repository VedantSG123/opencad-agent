import { factLabel, geometryRefText, geometryTypeLabel } from 'shared/geometry'
import type { Reference } from 'shared/references'

export function ReferenceChip({ reference }: { reference: Reference }) {
  const { kind, name, detail, title } = describe(reference)
  // Inline rather than flex: Chromium copies each flex item of a selection on
  // its own line, and the chip should copy as the line it reads as.
  return (
    <span
      title={title}
      className='inline-block max-w-full truncate rounded border border-separator px-1.5 py-0.5 align-middle text-xs text-foreground/70'
    >
      <span className='font-medium text-foreground'>{kind}</span>
      {detail && (
        <>
          <span className='text-foreground/25'>{' · '}</span>
          <span className='text-accent'>{detail}</span>
        </>
      )}
      <span className='text-foreground/25'>{' · '}</span>
      {name}
    </span>
  )
}

/** How a reference reads where chips cannot be drawn, such as a chat title. */
export function referenceLabel(reference: Reference): string {
  switch (reference.kind) {
    case 'face':
    case 'edge':
      return `${geometryTypeLabel(reference.type)} ${reference.kind} of ${reference.part}`
    case 'part':
      return reference.part
    case 'file':
      return reference.path
  }
}

function describe(reference: Reference): {
  kind: string
  detail?: string
  name: string
  title: string
} {
  switch (reference.kind) {
    case 'face':
    case 'edge':
      return {
        kind: factLabel(reference.kind),
        detail: geometryTypeLabel(reference.type),
        name: reference.part,
        title: geometryRefText(reference),
      }
    case 'part':
      return { kind: 'Part', name: reference.part, title: reference.part }
    case 'file':
      return {
        kind: 'File',
        name: reference.path.split('/').at(-1) ?? reference.path,
        title: reference.path,
      }
  }
}

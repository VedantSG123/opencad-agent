import { cn } from '@/lib/utils'

export type ExportFormatCard = {
  id: string
  label: string
  /** Shown as the badge, and usually the file extension. */
  ext: string
  description: string
}

/**
 * The format picker, shared by every kernel's export dialog.
 *
 * Which formats exist is the kernel's business; how choosing one looks is not,
 * and three copies of these cards had already started to drift.
 */
export function ExportFormatGrid({
  formats,
  selected,
  onSelect,
}: {
  formats: ExportFormatCard[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className='grid grid-cols-1 gap-3 py-2 sm:grid-cols-2'>
      {formats.map((card) => {
        const isActive = selected === card.id
        return (
          <button
            key={card.id}
            onClick={() => onSelect(card.id)}
            className={cn(
              'flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer outline-hidden select-none hover:scale-[1.01]',
              isActive
                ? 'border-accent bg-accent/5 text-foreground'
                : 'border-border/60 hover:border-foreground/30 text-foreground/60 hover:text-foreground bg-muted/10',
            )}
          >
            <div className='mb-1 flex w-full items-center justify-between'>
              <span className='text-sm font-bold text-foreground'>
                {card.label}
              </span>
              <span className='rounded-sm border border-border/50 bg-muted/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-foreground/60 uppercase'>
                {card.ext}
              </span>
            </div>
            <span className='text-xs leading-relaxed text-foreground/60'>
              {card.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}

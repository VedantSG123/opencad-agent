import { Tooltip } from '@heroui/react'
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'

const COPIED_MS = 1500

export function CopyButton({
  text,
  label,
  className,
}: {
  text: string
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      toast.error('Could not copy to the clipboard.')
    }
  }

  return (
    <Tooltip>
      <button
        type='button'
        aria-label={copied ? 'Copied' : label}
        onClick={() => void copy()}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
          className,
        )}
      >
        <Icon
          icon={copied ? Tick02Icon : Copy01Icon}
          size={14}
          className={copied ? 'text-success' : undefined}
        />
      </button>
      <Tooltip.Content>{copied ? 'Copied' : label}</Tooltip.Content>
    </Tooltip>
  )
}

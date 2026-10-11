import { Button } from '@heroui/react'
import { Download04Icon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'

/**
 * Opens a viewport's export dialog.
 *
 * Shared so the three kernels cannot drift: this was the same markup written
 * out three times, and the build123d one had already come out as a bare icon.
 */
export function ExportButton({ onPress }: { onPress: () => void }) {
  return (
    <Button
      onPress={onPress}
      size='sm'
      className='pointer-events-auto rounded-lg'
      variant='primary'
      aria-label='Export CAD model'
    >
      <Icon icon={Download04Icon} size={14} />
      <span>Export</span>
    </Button>
  )
}

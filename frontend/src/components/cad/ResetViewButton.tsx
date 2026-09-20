import { Button } from '@heroui/react'
import type * as React from 'react'

import type { StageHandle } from '@/components-3d/helpers/Stage'
import { cn } from '@/lib/utils'

import { VIEWPORT_PILL } from './ViewportStatusBar'

/** Frames the model again, undoing whatever the user orbited or zoomed to. */
export function ResetViewButton({
  stageRef,
}: {
  stageRef: React.RefObject<StageHandle | null>
}) {
  return (
    <Button
      size='sm'
      onPress={() => stageRef.current?.reset()}
      className={cn(
        VIEWPORT_PILL,
        'pointer-events-auto h-auto min-w-0 transition-colors hover:text-foreground',
      )}
    >
      Reset View
    </Button>
  )
}

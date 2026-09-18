import * as React from 'react'
import type { ShapeNode } from 'shared/build123d'

import type { VisibilityKind, VisibilityMap } from '@/kernels/build123d/tree'
import { initialVisibility } from '@/kernels/build123d/tree'

/**
 * Per-part visibility, seeded from the tree the runner sent and owned here
 * after that.
 *
 * Seeded rather than read straight from the payload because the user's toggles
 * have to outlive a render, and reset on a new tree because ids from a previous
 * build may not exist in this one.
 */
export function useBuild123dVisibility(tree: ShapeNode | null) {
  const [visibility, setVisibility] = React.useState<VisibilityMap>({})

  React.useEffect(() => {
    setVisibility(tree ? initialVisibility(tree) : {})
  }, [tree])

  const setVisible = React.useCallback(
    (ids: string[], kind: VisibilityKind, value: boolean) => {
      setVisibility((previous) => {
        const next = { ...previous }
        for (const id of ids) {
          const current = next[id]
          if (current) {
            next[id] = { ...current, [kind]: value }
          }
        }
        return next
      })
    },
    [],
  )

  return { visibility, setVisible }
}

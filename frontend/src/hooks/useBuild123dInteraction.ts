import * as React from 'react'
import type { ShapeNode } from 'shared/build123d'

import type { Pick, PickMode } from '@/components/cad/picks'
import type { DecodedModel } from '@/kernels/build123d/decode'
import {
  build123dReadout,
  build123dViewState,
  updateBuild123dViewState,
} from '@/kernels/build123d/interaction'
import type { VisibilityKind } from '@/kernels/build123d/tree'

export function useBuild123dInteraction(model: DecodedModel | null) {
  const [stored, setState] = React.useState(() => build123dViewState(model))
  const state = build123dViewState(model, stored)
  if (state !== stored) setState(state)
  const [mode, setMode] = React.useState<PickMode>('faces-and-edges')

  const pickedParts = React.useMemo(
    () =>
      new Set(
        state.picked.flatMap((held) =>
          held.kind === 'part' ? [held.partId] : [],
        ),
      ),
    [state.picked],
  )

  const pick = (picked: Pick, additive: boolean) =>
    setState((previous) =>
      updateBuild123dViewState(previous, {
        model,
        type: 'pick',
        pick: picked,
        additive,
      }),
    )
  const clearPicks = () =>
    setState((previous) =>
      updateBuild123dViewState(previous, { model, type: 'clear' }),
    )
  const selectNode = (node: ShapeNode, additive: boolean) =>
    setState((previous) =>
      updateBuild123dViewState(previous, {
        model,
        type: 'node',
        node,
        additive,
      }),
    )
  const setVisible = (ids: string[], kind: VisibilityKind, value: boolean) =>
    setState((previous) =>
      updateBuild123dViewState(previous, {
        model,
        type: 'visibility',
        ids,
        kind,
        value,
      }),
    )

  return {
    ...state,
    selection: build123dReadout(state),
    pickedParts,
    mode,
    setMode,
    pick,
    clearPicks,
    selectNode,
    setVisible,
  }
}

export type Build123dInteraction = ReturnType<typeof useBuild123dInteraction>

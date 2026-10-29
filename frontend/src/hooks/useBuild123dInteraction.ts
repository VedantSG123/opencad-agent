import * as React from 'react'
import type { ShapeNode } from 'shared/build123d'

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

  const selectFace = (partId: string, index: number) =>
    setState((previous) =>
      updateBuild123dViewState(previous, {
        model,
        type: 'face',
        partId,
        index,
      }),
    )
  const selectEdge = (partId: string, index: number) =>
    setState((previous) =>
      updateBuild123dViewState(previous, {
        model,
        type: 'edge',
        partId,
        index,
      }),
    )
  const selectNode = (node: ShapeNode) =>
    setState((previous) =>
      updateBuild123dViewState(previous, { model, type: 'node', node }),
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
    selectFace,
    selectEdge,
    selectNode,
    setVisible,
  }
}

export type Build123dInteraction = ReturnType<typeof useBuild123dInteraction>

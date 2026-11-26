import type { ShapeNode } from 'shared/build123d'
import { geometryTypeLabel } from 'shared/geometry'

import type { Pick } from '@/components/cad/picks'
import { applyPick } from '@/components/cad/picks'
import type { SelectedComponent } from '@/types'

import type { DecodedModel } from './decode'
import { build123dReference, worldFacts } from './facts'
import type { VisibilityKind, VisibilityMap } from './tree'
import { initialVisibility, leafIds } from './tree'

export type Build123dViewState = {
  model: DecodedModel | null
  revision: number
  /** In the order picked; the readout names the last. */
  picked: Pick[]
  selectedNode: string | null
  selectedParts: string[]
  visibility: VisibilityMap
}

type Action = { model: DecodedModel | null } & (
  | { type: 'pick'; pick: Pick; additive: boolean }
  | { type: 'clear' }
  | { type: 'node'; node: ShapeNode }
  | { type: 'visibility'; ids: string[]; kind: VisibilityKind; value: boolean }
)

export function build123dViewState(
  model: DecodedModel | null,
  previous?: Build123dViewState,
): Build123dViewState {
  if (previous?.model === model) return previous
  return {
    model,
    revision: previous ? previous.revision + 1 : 0,
    picked: [],
    selectedNode: null,
    selectedParts: [],
    visibility: model ? initialVisibility(model.tree) : {},
  }
}

function findNode(tree: ShapeNode, id: string): ShapeNode | undefined {
  if (tree.id === id) return tree
  for (const child of tree.parts ?? []) {
    const found = findNode(child, id)
    if (found) return found
  }
}

function pickedPart(model: DecodedModel | null, pick: Pick) {
  if (!model || !Number.isInteger(pick.index) || pick.index < 0) return
  const part = model.parts.find((candidate) => candidate.id === pick.partId)
  const count =
    pick.kind === 'face'
      ? part?.instance.faceTypes.length
      : part?.instance.edgeTypes.length
  return count !== undefined && pick.index < count ? part : undefined
}

export function updateBuild123dViewState(
  state: Build123dViewState,
  action: Action,
): Build123dViewState {
  if (state.model !== action.model) return state
  if (action.type === 'node') {
    const node = state.model
      ? findNode(state.model.tree, action.node.id)
      : undefined
    if (!node) return state
    const same = state.selectedNode === node.id
    return {
      ...state,
      selectedNode: same ? null : node.id,
      selectedParts: same ? [] : leafIds(node),
    }
  }
  if (action.type === 'visibility') {
    const visibility = { ...state.visibility }
    for (const id of action.ids) {
      const current = visibility[id]
      if (current) visibility[id] = { ...current, [action.kind]: action.value }
    }
    return { ...state, visibility }
  }
  if (action.type === 'clear') {
    return state.picked.length ? { ...state, picked: [] } : state
  }
  if (!pickedPart(state.model, action.pick)) return state
  return {
    ...state,
    picked: applyPick(state.picked, action.pick, action.additive),
  }
}

export function build123dReadout(
  state: Build123dViewState,
): SelectedComponent | null {
  const last = state.picked.at(-1)
  const part = last && pickedPart(state.model, last)
  if (!last || !part) return null
  const { kind, index } = last
  const entity = worldFacts(part, kind, index)
  return {
    kind,
    index,
    subject: part.name,
    ...(entity && {
      geometryType: geometryTypeLabel(entity.type),
      facts: entity.facts,
      reference: build123dReference(part, kind, index),
    }),
  }
}

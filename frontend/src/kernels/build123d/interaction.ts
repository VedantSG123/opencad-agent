import type { ShapeNode } from 'shared/build123d'

import { activeSelection } from '@/components/cad/activeSelection'
import type { ComponentKind, SelectedComponent } from '@/types'

import type { DecodedModel } from './decode'
import { curveTypeName, surfaceTypeName } from './geometryTypes'
import type { VisibilityKind, VisibilityMap } from './tree'
import { initialVisibility, leafIds } from './tree'

export type Build123dSelection = { partId: string; index: number }

export type Build123dViewState = {
  model: DecodedModel | null
  revision: number
  face: Build123dSelection | null
  edge: Build123dSelection | null
  lastKind: ComponentKind | null
  selectedNode: string | null
  selectedParts: string[]
  visibility: VisibilityMap
}

type Action = { model: DecodedModel | null } & (
  | { type: 'face' | 'edge'; partId: string; index: number }
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
    face: null,
    edge: null,
    lastKind: null,
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

function selectedPart(
  model: DecodedModel | null,
  selection: Build123dSelection | null,
  kind: ComponentKind,
) {
  if (
    !model ||
    !selection ||
    !Number.isInteger(selection.index) ||
    selection.index < 0
  )
    return
  const part = model.parts.find(
    (candidate) => candidate.id === selection.partId,
  )
  const count =
    kind === 'face'
      ? part?.instance.faceTypes.length
      : part?.instance.edgeTypes.length
  return count !== undefined && selection.index < count ? part : undefined
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
  if (
    !selectedPart(
      state.model,
      { partId: action.partId, index: action.index },
      action.type,
    )
  )
    return state
  const current = state[action.type]
  const next =
    current?.partId === action.partId && current.index === action.index
      ? null
      : { partId: action.partId, index: action.index }
  return { ...state, [action.type]: next, lastKind: next ? action.type : null }
}

export function build123dReadout(
  state: Build123dViewState,
): SelectedComponent | null {
  const face = selectedPart(state.model, state.face, 'face') ? state.face : null
  const edge = selectedPart(state.model, state.edge, 'edge') ? state.edge : null
  const active = activeSelection(state.lastKind, face, edge)
  if (!state.model || !active) return null
  const { kind, value } = active
  const part = selectedPart(state.model, value, kind)
  if (!part) return null
  return {
    kind,
    index: value.index,
    subject: part.name,
    geometryType:
      kind === 'edge'
        ? curveTypeName(part.instance.edgeTypes[value.index])
        : surfaceTypeName(part.instance.faceTypes[value.index]),
  }
}

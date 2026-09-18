import type { ShapeNode } from 'shared/build123d'

export type Visibility = { faces: boolean; edges: boolean }
export type VisibilityMap = Record<string, Visibility>

/** Which half of a node's visibility a toggle acts on. */
export type VisibilityKind = keyof Visibility

/** A group is on, off, or neither - the third state its toggle has to show. */
export type GroupState = 'on' | 'off' | 'mixed'

export function isGroup(node: ShapeNode): boolean {
  return Array.isArray(node.parts)
}

/**
 * The leaves under a node, which is what a group's toggle acts on.
 *
 * Only leaves carry geometry and only leaves carry `state`, so a group has no
 * visibility of its own - what it shows is a reading of its descendants.
 */
export function leafIds(node: ShapeNode): string[] {
  if (!node.parts) {
    return node.shape ? [node.id] : []
  }
  return node.parts.flatMap(leafIds)
}

export function initialVisibility(tree: ShapeNode): VisibilityMap {
  const map: VisibilityMap = {}

  const visit = (node: ShapeNode) => {
    if (node.parts) {
      node.parts.forEach(visit)
      return
    }
    if (node.shape) {
      map[node.id] = {
        faces: (node.state?.[0] ?? 1) === 1,
        edges: (node.state?.[1] ?? 1) === 1,
      }
    }
  }

  visit(tree)
  return map
}

export function groupState(
  ids: string[],
  visibility: VisibilityMap,
  kind: VisibilityKind,
): GroupState {
  let on = 0
  for (const id of ids) {
    if (visibility[id]?.[kind]) {
      on++
    }
  }
  if (on === 0) {
    return 'off'
  }
  return on === ids.length ? 'on' : 'mixed'
}

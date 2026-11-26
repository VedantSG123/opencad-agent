import type { ComponentKind } from '@/types'

/** What a click in the viewport picks. */
export type PickMode = 'faces-and-edges' | 'faces' | 'edges' | 'parts'

export const PICK_MODES: readonly PickMode[] = [
  'faces-and-edges',
  'faces',
  'edges',
  'parts',
]

export const PICK_MODE_LABEL: Record<PickMode, string> = {
  'faces-and-edges': 'Faces and edges',
  faces: 'Faces',
  edges: 'Edges',
  parts: 'Parts',
}

export const PICK_MODE_HINT: Record<PickMode, string> = {
  'faces-and-edges': 'The edge under the cursor, otherwise the face',
  faces: 'Faces only; clicks pass through edges',
  edges: 'Edges only',
  parts: 'The whole part under the cursor',
}

/** Something the user picked, by the part it belongs to. */
export type Pick =
  | { kind: ComponentKind; partId: string; index: number }
  | { kind: 'part'; partId: string }

export type PartPicks = { whole: boolean; faces: number[]; edges: number[] }

export function samePick(a: Pick, b: Pick): boolean {
  if (a.kind === 'part' || b.kind === 'part') {
    return a.kind === b.kind && a.partId === b.partId
  }
  return a.kind === b.kind && a.partId === b.partId && a.index === b.index
}

/** Whether faces, or edges, take clicks and hover under `mode`. */
export function picksInMode(mode: PickMode, kind: ComponentKind): boolean {
  switch (mode) {
    case 'faces-and-edges':
    case 'parts':
      return true
    case 'faces':
      return kind === 'face'
    case 'edges':
      return kind === 'edge'
  }
}

/** What a click on a face or an edge picks under `mode`, if anything. */
export function pickInMode(
  mode: PickMode,
  kind: ComponentKind,
  partId: string,
  index: number,
): Pick | null {
  if (!picksInMode(mode, kind)) return null
  return mode === 'parts' ? { kind: 'part', partId } : { kind, partId, index }
}

/**
 * Applies one click, which picks one thing in the viewport or every part of a
 * tree group. Shift adds them, or takes them back out when all are already
 * picked. A plain click replaces every pick, and clicking exactly what is
 * picked again clears it.
 */
export function applyPicks(
  picked: readonly Pick[],
  picks: readonly Pick[],
  additive: boolean,
): Pick[] {
  const isPicked = (pick: Pick) => picked.some((held) => samePick(held, pick))
  const allPicked = picks.every(isPicked)
  if (additive) {
    return allPicked
      ? picked.filter((held) => !picks.some((pick) => samePick(held, pick)))
      : [...picked, ...picks.filter((pick) => !isPicked(pick))]
  }
  return allPicked && picked.length === picks.length ? [] : [...picks]
}

export function picksByPart(picked: readonly Pick[]): Map<string, PartPicks> {
  const byPart = new Map<string, PartPicks>()
  for (const pick of picked) {
    const held = byPart.get(pick.partId) ?? {
      whole: false,
      faces: [],
      edges: [],
    }
    if (pick.kind === 'part') held.whole = true
    else held[pick.kind === 'face' ? 'faces' : 'edges'].push(pick.index)
    byPart.set(pick.partId, held)
  }
  return byPart
}

export function allIndices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

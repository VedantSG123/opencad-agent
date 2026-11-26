import type { ComponentKind } from '@/types'

/** A face or edge the user clicked, by the part it belongs to. */
export type Pick = { kind: ComponentKind; partId: string; index: number }

export type PartPicks = { faces: number[]; edges: number[] }

export function samePick(a: Pick, b: Pick): boolean {
  return a.kind === b.kind && a.partId === b.partId && a.index === b.index
}

/**
 * Shift adds a pick or takes it back out. A plain click replaces every pick,
 * and clicking the only pick again clears it.
 */
export function applyPick(
  picked: readonly Pick[],
  pick: Pick,
  additive: boolean,
): Pick[] {
  const isPicked = picked.some((held) => samePick(held, pick))
  if (additive) {
    return isPicked
      ? picked.filter((held) => !samePick(held, pick))
      : [...picked, pick]
  }
  return isPicked && picked.length === 1 ? [] : [pick]
}

export function picksByPart(picked: readonly Pick[]): Map<string, PartPicks> {
  const byPart = new Map<string, PartPicks>()
  for (const { kind, partId, index } of picked) {
    const held = byPart.get(partId) ?? { faces: [], edges: [] }
    held[kind === 'face' ? 'faces' : 'edges'].push(index)
    byPart.set(partId, held)
  }
  return byPart
}

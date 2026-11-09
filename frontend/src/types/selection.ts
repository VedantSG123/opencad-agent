import type { EntityFact } from 'shared/build123d'

/** Which kind of BRep component a selection names. */
export type ComponentKind = 'face' | 'edge'

/**
 * A selected BRep component, in the terms a reader needs rather than the ones
 * picking produces.
 *
 * `geometryType` and `facts` are optional because only build123d reports
 * them; replicad's mesh output does not.
 */
export type SelectedComponent = {
  kind: ComponentKind
  /** Position among the shape's faces or edges. */
  index: number
  /** The part or shape it belongs to, named for display. */
  subject?: string
  /** 'Plane', 'Cylinder', 'Circle'… where the kernel reports it. */
  geometryType?: string
  /** Measurements in world coordinates. */
  facts?: EntityFact[]
}

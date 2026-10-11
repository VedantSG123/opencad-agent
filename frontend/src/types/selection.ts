/** Which kind of BRep component a selection names. */
export type ComponentKind = 'face' | 'edge'

/**
 * A selected BRep component, in the terms a reader needs rather than the ones
 * picking produces.
 *
 * `geometryType` is optional because only some kernels report one: build123d
 * carries OCCT's surface and curve types, replicad's mesh output does not.
 */
export type SelectedComponent = {
  kind: ComponentKind
  /** Position among the shape's faces or edges. */
  index: number
  /** The part or shape it belongs to, named for display. */
  subject?: string
  /** 'Plane', 'Cylinder', 'Circle'… where the kernel reports it. */
  geometryType?: string
}

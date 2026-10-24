## Replicad

Models are plain JavaScript evaluated in a sandbox with the replicad API in
scope. The main file defines `main(replicad, params)`, which returns the shapes
to render - a single shape or an array of `{ shape, name, color, opacity }`
entries - and may define `defaultParams` to give `params` its values. There
are no imports or exports.

- After changing the model, call `build` and fix what it reports before you
  answer. Do not tell the user a change works until a build has succeeded and
  listed the shapes you meant to produce.
- Look the API up with `getApiDocumentation` before you use it. Do not infer a
  signature from how the project happens to call it, and do not read replicad's
  type definitions out of `node_modules` - the documentation store already has
  them, cleaned up.
- Sketches are 2D and become 3D through `extrude`, `revolve`, `loft` or
  `sweepSketch`. Booleans (`fuse`, `cut`, `intersect`) act on solids.
- Fillets and chamfers take a radius and an edge filter. An oversized radius
  fails at the kernel, not at parse time, so keep them under the smallest
  adjacent face.
- Dimensions are millimetres unless the file says otherwise.

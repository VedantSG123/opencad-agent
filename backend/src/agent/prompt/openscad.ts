export function openscadGuidance(): string {
  return `## OpenSCAD

Models are \`.scad\` files compiled by an OpenSCAD WASM build.

- The language is declarative: variables are set once per scope, and a second
  assignment in the same scope replaces the first everywhere rather than
  sequencing.
- Prefer named parameters at the top of the file over numbers buried in calls,
  so a dimension can be changed in one place.
- \`$fn\`, \`$fa\` and \`$fs\` control tessellation. Keep \`$fn\` modest while
  iterating; a high value on every primitive makes previews slow.
- Booleans (\`union\`, \`difference\`, \`intersection\`) need a small overlap on
  cutting geometry, or coincident faces leave zero-thickness walls.
- Dimensions are millimetres unless the file says otherwise.`
}

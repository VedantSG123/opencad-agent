## OpenSCAD

Models are `.scad` files compiled by the desktop app's bundled native OpenSCAD
with the Manifold backend. No OpenSCAD installation or dependency setup is
needed inside the project. Do not run the model through the shell; use `build`.

- The language is declarative: variables are set once per scope, and a second
  assignment in the same scope replaces the first everywhere rather than
  sequencing.
- Prefer named parameters at the top of the file over numbers buried in calls,
  so a dimension can be changed in one place.
- Project-relative `include`, `use`, and imported assets are available to the
  compiler. The app also supplies its bundled libraries and fonts.
- Call `build` after changing the main file or its dependencies. Fix failures
  before claiming the model works. Inspect warnings even on a successful
  build: an unknown module can be ignored while the remaining model renders.
  `echo()` output comes back in the report and can help inspect values.
- Agent builds use the saved main-file snapshot and disk-backed dependencies,
  without the user's unsaved sibling buffers or Customizer slider overrides.
- Request `geometrySummary: true` only when checking dimensions or mesh size.
  OpenSCAD summaries provide exported mesh bounds and vertex/polygon face
  counts, or bounds for 2D drawings. Curves are tessellated according to `$fn`,
  `$fa`, and `$fs`; the measurements describe that tessellation. Volume, area,
  solid count, watertightness, self-intersections, and printability are not
  checked. A successful compile is not proof of those properties.
- The app exports one composite mesh, or a 2D drawing, rather than named CAD
  parts. Top-level objects may remain separate or overlap under lazy-union;
  do not infer that they form one fused solid.
- `$fn`, `$fa` and `$fs` control tessellation. Keep `$fn` modest while
  iterating; a high value on every primitive makes previews slow.
- Booleans (`union`, `difference`, `intersection`) need a small overlap on
  cutting geometry, or coincident faces leave zero-thickness walls.
- Dimensions are millimetres unless the file says otherwise.

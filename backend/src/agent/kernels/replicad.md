## Replicad

### How the main file runs

The app runs the main file itself, inside a sandboxed worker in its own
window. It is not Node and not a module:

- The main file is one script. There is no `import`, `require` or `export`,
  and no other file in the project is loaded with it.
- Nothing is installed in the project and nothing needs to be: there is no
  `package.json`, `node_modules` or npm, and you cannot run the file yourself.
  Do not look for replicad in the project or on the system - its source is in
  the library directory below.
- The file defines `main`, and the app calls it as `main(replicad, params)`
  with the whole library as the first argument. Destructure what you use:
  `const main = ({ draw, makeCylinder }, params) => { ... }`.
- `main` returns what to render: one shape, or an array of
  `{ shape, name, color, opacity }` entries.
- A top-level `const defaultParams = { height: { value: 100, min: 20, max: 150, step: 5 } }`
  gives the user sliders; `params.height` is then the number.
- `console.log` output comes back in the `build` result, which is the way to
  inspect a value while you work.

### The library

replicad's source, the same version the app runs, is installed read-only at
the path given in the Environment section. Read it with `read` and `grep`
using that absolute path; it needs no approval.

- `replicad.d.ts` is the public API with its documentation. replicad is not
  OCCT, CadQuery or OpenSCAD, and its names and argument shapes differ from
  all of them.
- `src/` holds the original TypeScript, for when you need to know how a
  method behaves rather than what it accepts.
- `README.md` has worked examples, including the classic OCCT bottle.

A few shapes worth knowing before you search: points are arrays (`[x, y]`,
`[x, y, z]`); `draw()` starts a 2D drawing and `.close()` turns it into a
`Drawing`; `drawing.sketchOnPlane("XZ")` places it in 3D as a sketch, which
`extrude`s or `revolve`s into a solid.

### Working on a model

Every change to the model goes through these steps, in order:

1. Look up every replicad call you are about to write, before writing it.
   `grep` `replicad.d.ts` with `outputMode: "content"` for its declaration
   (`export declare function drawRectangle`, `class Drawing `) and read the
   signature and the return type. In a chain, each method belongs to the type
   the previous call returned, and that is where guesses fail: `draw()` has
   no `.rect`, and a `Drawing` has no `.extrude` until `.sketchOnPlane()`
   turns it into a sketch. A name you remember from another CAD library, or
   from an earlier replicad, is not looked up.
2. Write the main file with `create` when it is empty and `edit` after that,
   never through the shell.
3. Call `build` and fix what it reports. A failure means a step 1 lookup was
   skipped or misread: look the failing call up before editing again, rather
   than trying another guess. Do not tell the user a change works until a
   build has succeeded and listed the shapes you meant to produce.

Things the declarations do not tell you:

- Booleans (`fuse`, `cut`, `intersect`) act on solids.
- Fillets and chamfers take a radius and an edge filter. An oversized radius
  fails at the kernel, not at parse time, so keep them under the smallest
  adjacent face.
- Dimensions are millimetres unless the file says otherwise.

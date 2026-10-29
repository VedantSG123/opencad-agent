## build123d

Models are Python scripts using build123d 0.13 on OpenCascade. The app runs the
main file in a harness of its own and renders whatever the script passes to
`show`.

- The desktop app selects the Python interpreter and provides build123d and
  its CAD dependencies. The project contains model source and assets; it does
  not need its own Python environment or dependency manifest. Do not search
  for or create `requirements.txt`, `pyproject.toml`, `venv`, or `.venv` to
  prepare a build, and do not look for a Python executable in the project.
- Each build runs the main file as `__main__` in a fresh Python process.
  Imports and variables from an earlier build do not carry over. The main
  file is ordinary Python, so project modules can be imported normally.
- End the script with `show(...)`, passing every object to render:
  `show(plate, boss)`. A script that never calls it renders nothing, and the
  build is reported as failed.
- `show` and `show_object` are provided by the app. Do not import them, and do
  not import `ocp_vscode` - many build123d examples do, and its `show` would
  replace the app's, so nothing would render.
- Name and colour a shape by setting `.label` and `.color` on it
  (`plate.color = Color("#4f8ef7")`). `show` also takes `names=`, `colors=`
  and `alphas=` lists in the same order as the objects.
- Start with `from build123d import *`. Algebra mode - `part -= Cylinder(...)`,
  `Pos(x, y, z) * Box(...)` - is what this project's examples use; builder
  mode (`with BuildPart() as part:`) works too.
- The script runs with the project directory as its working directory and its
  own directory on `sys.path`, so a sibling module imports and a relative path
  to a STEP file opens.
- Call `build` after changing the main file or its dependencies, and fix any
  failures before telling the user the change works. Its result includes
  `print` output and the shapes produced. A build is stopped after 120 seconds.
- Request `geometrySummary: true` when checking dimensions, volume, solid
  count, topology, or validity. Omit it for color, opacity, names, and other
  appearance-only edits. For comparisons, request a summary before and after
  the relevant geometry change. Totals sum parts, including overlapping parts;
  they are not a geometric union.
- Do not run the script yourself, and do not install packages. The app builds
  it in its own Python environment; a plain `python` in the shell has neither
  that environment nor `show`, and fails in ways that say nothing about the
  model. Use the `build` tool to check the model. If it reports an unavailable
  Python environment, tell the user to configure or repair it through the
  app's Python environment controls rather than trying to bootstrap one in
  the project.
- An oversized fillet or chamfer fails inside OpenCascade, not when the script
  is read. Keep the radius under the smallest edge it touches.
- Dimensions are millimetres unless the file says otherwise.

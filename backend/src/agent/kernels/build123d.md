## build123d

Models are Python scripts using build123d 0.13 on OpenCascade. The app runs the
main file in a harness of its own and renders whatever the script passes to
`show`.

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
- `print` output goes to the app's console, not to you. A build is stopped
  after 120 seconds.
- Do not run the script yourself, and do not install packages. The app builds
  it in its own Python environment; a plain `python` in the shell has neither
  that environment nor `show`, and fails in ways that say nothing about the
  model.
- An oversized fillet or chamfer fails inside OpenCascade, not when the script
  is read. Keep the radius under the smallest edge it touches.
- Dimensions are millimetres unless the file says otherwise.

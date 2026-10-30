export const prompt = `Build the project's saved main file with the app's CAD kernel and report whether it worked.

WHEN TO USE: after every edit or create that changes the model, before you tell
  the user the change is done. Again after each fix, until it builds.

WHEN NOT TO USE: when nothing that the main file depends on has changed since
  the last build, unless you need geometry measurements the last build did not request.

USAGE: builds the main file as saved on disk, so make
  your edits first. A failure includes console output and, when available, the
  main-file location and surrounding code - log a value from the model when
  you need to see it. A success lists the shapes the model produced; check they
  are the ones you meant, because a build that succeeds can still be wrong.

GEOMETRY: omit geometrySummary for an ordinary build. Set geometrySummary: true
  when checking dimensions, volume, solid count, or validity after creating or
  resizing geometry, booleans, shells, fillets, or changes to part connections.
  Skip it for color, opacity, names, and other appearance-only changes.
  If a comparison matters, request a summary before editing and another after;
  compare their measurements. Do not request a summary on every build by habit.
  Replicad and build123d add per-part bounds, area, solid count, validity and shell closure,
  plus volume and centre of mass for valid closed solid geometry. An open shell
  can be valid; a successful build is not proof that geometry meets the brief.
  Volumes and areas in overall totals are sums of parts, not a geometric union.
  OpenSCAD summaries are limited to tessellated mesh bounds and vertex/polygon
  face counts, or 2D bounds. They do not check volume, area, solid count or
  topology validity. Mesh output does not preserve named CAD parts.

  A result starting with "Error" means the app could not run the build at all,
  not that the code is wrong: do not retry it, tell the user.`

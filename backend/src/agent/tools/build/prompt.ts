export const prompt = `Build the project's main file in the app - the same build the user's viewport shows - and report whether it worked.

WHEN TO USE: after every edit or create that changes the model, before you tell
  the user the change is done. Again after each fix, until it builds.

WHEN NOT TO USE: when nothing that the main file depends on has changed since
  the last build; the result will be the same.

USAGE: takes no arguments. It builds the main file as saved on disk, so make
  your edits first. A failure names the line in the main file, shows the code
  around it, and includes the console output - log a value from the model when
  you need to see it. A success lists the shapes the model produced; check they
  are the ones you meant, because a build that succeeds can still be wrong.
  A result starting with "Error" means the app could not run the build at all,
  not that the code is wrong: do not retry it, tell the user.`

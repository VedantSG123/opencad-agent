export const prompt = `Run a shell command in the project directory.

The command is handed to PowerShell on Windows and to bash elsewhere, so write
it for whichever shell this machine uses.

Every command is weighed against the project's permissions before it runs, and
the user may be asked to approve it. Keep each call to a single purpose: a long
chain is judged by its strictest part, so \`git status && rm -rf build\` is
treated as the removal.

Output is stdout and stderr together, as a terminal would show them.`

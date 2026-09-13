export const prompt = `Run a shell command in the project directory. Returns stdout and stderr together, as a terminal would show them.

WHEN TO USE: building, testing and typechecking, installing packages, git
  operations, listing a directory or a tree, running a project script -
  anything real work needs that no other tool covers.

WHEN NOT TO USE: reading a file's contents (use read instead). Searching file
  contents (use grep instead). Making a new file (use create instead).
  Changing a file (use edit instead).

DO NOT USE FOR: \`cat\`, \`head\`, \`tail\` or \`Get-Content\` to read a file (use
  read), \`rg\`, \`grep\` or \`Select-String\` to search (use grep), \`echo >\`,
  \`Set-Content\` or \`New-Item\` to write a file (use create), \`sed -i\` or
  \`awk -i\` to change one (use edit). The dedicated tools report line numbers,
  respect \`.gitignore\`, and do not need approval inside the project.

USAGE: \`command\` is a single string, handed to PowerShell on Windows and to
  bash elsewhere - write it for whichever shell this machine uses. Keep each
  call to a single purpose: a command line is judged by its strictest part, so
  \`git status && rm -rf build\` is weighed as the removal, and one long chain
  costs more approvals than several plain calls. Every command is weighed
  against the project's permissions first, and the user may be asked to approve
  it. Read-only commands inside the project run without asking; a command that
  reaches a file outside the project is put to the user, and one that names a
  credential file, an env file or \`.git\` is refused outright. Nothing is
  interactive - a command that waits for input fails rather than hanging.
  \`timeoutMs\` defaults to 120000 and is capped at 600000.

EXAMPLES:
- Run the tests: command "bun test"
- Typecheck: command "bun run typecheck"
- Check what changed: command "git status"`

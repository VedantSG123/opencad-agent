export const prompt = `Create a new file, or fill an existing empty one, and write its contents in one call. Returns the path and the size of what was written.

WHEN TO USE: adding a source file that does not exist yet, writing the first
  contents of an empty file (a new project's main file starts empty), starting
  a new module or part, writing a config, a script or a notes file for the
  first time.

WHEN NOT TO USE: changing a file that already has contents (read it, then use
  edit). Replacing the contents of a non-empty file - nothing is ever
  overwritten, and the call is refused.

DO NOT USE FOR: modifying an existing file (use edit), \`echo >\`, \`Set-Content\`
  or \`New-Item\` through the shell (use this tool), making a directory on its
  own (missing parents are created for you), reading a file (use read).

USAGE: \`path\` is relative to the project directory, e.g. "src/parts.scad". The
  file must not exist yet, or must be empty; if you meant to change one with
  contents, read it and use edit. Missing directories along the path are created for you.
  \`content\` is written exactly as given - include the indentation the file
  should have and the trailing newline it should end with. Write the file
  whole: there is no appending, and a later change goes through edit. Files
  outside the project need the user's approval.

EXAMPLES:
- \`{ "path": "src/bracket.scad", "content": "module bracket() {\\n  cube([10, 10, 2]);\\n}\\n" }\`
- An empty placeholder: \`{ "path": "notes.md", "content": "" }\``

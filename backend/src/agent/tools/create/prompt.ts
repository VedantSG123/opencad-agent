export const prompt = `Create a new file and write its contents in one call. Returns the path and the size of what was written.

WHEN TO USE: adding a source file that does not exist yet, starting a new
  module or part, writing a config, a script or a notes file for the first time.

WHEN NOT TO USE: changing a file that already exists (read it, then use edit).
  Replacing the contents of an existing file - nothing is ever overwritten, and
  the call is refused.

DO NOT USE FOR: modifying an existing file (use edit), \`echo >\`, \`Set-Content\`
  or \`New-Item\` through the shell (use this tool), making a directory on its
  own (missing parents are created for you), reading a file (use read).

USAGE: \`path\` is relative to the project directory, e.g. "src/parts.scad". The
  file must not already exist; if you meant to change one that does, read it
  and use edit. Missing directories along the path are created for you.
  \`content\` is written exactly as given - include the indentation the file
  should have and the trailing newline it should end with. Write the file
  whole: there is no appending, and a later change goes through edit. Files
  outside the project need the user's approval.

EXAMPLES:
- \`{ "path": "src/bracket.scad", "content": "module bracket() {\\n  cube([10, 10, 2]);\\n}\\n" }\`
- An empty placeholder: \`{ "path": "notes.md", "content": "" }\``

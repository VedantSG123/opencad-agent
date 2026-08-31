export const prompt = `Create a new file and write its contents in one call. This is for a file that does not exist yet; edit is the tool for changing one that does.

Usage notes:
- \`path\` is relative to the project directory, e.g. "src/parts.scad".
- The file must not already exist. Nothing is ever overwritten - if you meant to change a file that is there, read it and use edit.
- Missing directories along the path are created for you.
- \`content\` is written exactly as given: include the indentation the file should have, and the trailing newline it should end with.
- Write the file whole. There is no appending; a later change goes through edit.

Examples:
- \`{ "path": "src/bracket.scad", "content": "module bracket() {\\n  cube([10, 10, 2]);\\n}\\n" }\`
- An empty placeholder: \`{ "path": "notes.md", "content": "" }\``

export const prompt = `Read a text file from the project and get its contents back as numbered lines. Use this once you know which file you need - grep is the cheaper way to find that out.

Usage notes:
- Lines are rendered as \`<line number> | <text>\`. The numbers are added by this tool; the file itself does not contain them.
- Only part of a long file comes back per call. When the output says the file continues, call again with the \`offset\` it suggests rather than guessing.
- \`path\` is relative to the project directory and is reported with \`/\` separators on every operating system. Only files inside the project can be read.
- Directories cannot be read (use grep to search inside one), and neither can binary files such as images, archives or compiled output.
- Very long lines are clipped, and a note says how many.

Examples:
- Whole small file: \`{ "path": "src/index.ts" }\`
- Around a grep hit on line 812: \`{ "path": "src/index.ts", "offset": 790, "limit": 60 }\`
- Continue a file that was cut off at line 500: \`{ "path": "src/index.ts", "offset": 501 }\``

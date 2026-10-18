export const prompt = `Read a text file from the project. Returns the requested lines numbered as \`<line number> | <text>\`.

WHEN TO USE: viewing a file whose path you already know, checking a
  configuration, reading source before editing it, examining a specific region
  around a grep hit with \`offset\` and \`limit\`.

WHEN NOT TO USE: finding which file contains something (use grep instead).
  Changing a file (use edit instead). Making a new file (use create instead).

DO NOT USE FOR: searching across files (use grep), \`cat\`, \`head\`, \`tail\` or
  \`Get-Content\` through the shell (use this tool), listing a directory
  (use shell), reading a directory or a binary file (both are refused).

USAGE: \`path\` is relative to the project directory and is reported with \`/\`
  separators on every operating system. \`offset\` is 1-based and \`limit\`
  defaults to 500 lines, capped at 2000. The line numbers are added by this
  tool; the file itself does not contain them. Only part of a long file comes
  back per call - when the output says the file continues, call again with the
  \`offset\` it suggests rather than guessing. Very long lines are clipped and a
  note says how many. Files outside the project need the user's approval.

EXAMPLES:
- Whole small file: \`{ "path": "src/index.ts" }\`
- Around a grep hit on line 812: \`{ "path": "src/index.ts", "offset": 790, "limit": 60 }\`
- Continue a file that was cut off at line 500: \`{ "path": "src/index.ts", "offset": 501 }\``

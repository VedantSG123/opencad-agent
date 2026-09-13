export const prompt = `Search file contents across the project with a regex. Returns matching file paths, the matching lines, or a count per file.

WHEN TO USE: finding where a symbol is defined, which files import a module,
  locating a configuration key, finding TODOs or an error message. Reach for
  this first when you do not yet know which file you need - it is far cheaper
  than reading files one by one.

WHEN NOT TO USE: reading a file you have already located (use read instead).
  Looking up a replicad class or method (use getApiDocumentation instead).
  Running a command (use shell instead).

DO NOT USE FOR: reading a known file (use read), \`rg\`, \`grep\` or
  \`Select-String\` through the shell (use this tool), listing files by name
  rather than content (use shell), modifying files (use edit).

USAGE: \`pattern\` is a Rust regex (the syntax ripgrep and most regex engines
  use). Escape metacharacters when you want them literally: \`\\.\`, \`\\(\`, \`\\$\`,
  \`\\[\`. Start with the default \`filesWithMatches\` mode to locate the relevant
  files, then re-run with \`content\` mode - or read the file - once you know
  where to look. Results respect \`.gitignore\` and skip hidden files, so build
  output and dependencies stay out of the way; set \`includeIgnored\` to search
  those anyway (to look inside \`.github/\` or \`dist/\`, for example). Narrow a
  wide search with \`path\`, \`glob\` or \`type\` instead of raising \`headLimit\`.
  All paths are relative to the project directory and are always reported with
  \`/\` separators, on every operating system.

EXAMPLES:
- Where a symbol is defined: \`{ "pattern": "function makeCylinder", "outputMode": "content", "contextLines": 2 }\`
- Which files import a module: \`{ "pattern": "from ['\\"]replicad['\\"]", "glob": "*.{js,ts}" }\`
- Multi-line match: \`{ "pattern": "export default \\\\{[^}]*shape", "multiline": true, "outputMode": "content" }\``

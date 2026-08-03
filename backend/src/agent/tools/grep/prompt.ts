export const prompt = `Search file contents across the project. Use this whenever you need to find where something is defined, used, imported or configured - it is far cheaper than reading files one by one.

Usage notes:
- \`pattern\` is a Rust regex (the same syntax ripgrep and most regex engines use). Escape regex metacharacters when you want them literally: \`\\.\`, \`\\(\`, \`\\$\`, \`\\[\`.
- Start with the default \`filesWithMatches\` mode to locate the relevant files, then re-run with \`content\` mode (or read the file) once you know where to look.
- Results respect \`.gitignore\` and skip hidden files, so build output and dependencies stay out of the way. Set \`includeIgnored\` to search them anyway (for example to look inside \`.github/\` or \`dist/\`).
- Narrow wide searches with \`path\`, \`glob\` or \`type\` instead of raising \`headLimit\`.
- All paths are relative to the project directory and are always reported with \`/\` separators, on every operating system.

Examples:
- Where is a symbol defined: \`{ "pattern": "function makeCylinder", "outputMode": "content", "contextLines": 2 }\`
- Which files import a module: \`{ "pattern": "from ['\\"]replicad['\\"]", "glob": "*.{js,ts}" }\`
- Multi-line match: \`{ "pattern": "export default \\\\{[^}]*shape", "multiline": true, "outputMode": "content" }\``

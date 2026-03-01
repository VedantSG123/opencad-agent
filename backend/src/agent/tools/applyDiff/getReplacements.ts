/* eslint-disable no-irregular-whitespace */
/*
Regex parts:

1. (?:^|\n)  
  Ensures the first marker starts at the beginning of the file or right after a newline.

2. (?<!\\)<<<<<<< SEARCH\s*\n  
  Matches the line “<<<<<<< SEARCH” (ignoring any trailing spaces) – the negative lookbehind makes sure it isn’t escaped.

3. ((?:\:start_line:\s*(\d+)\s*\n))?  
  Optionally matches a “:start_line:” line. The outer capturing group is group 1 and the inner (\d+) is group 2.

4. ((?:\:end_line:\s*(\d+)\s*\n))?  
  Optionally matches a “:end_line:” line. Group 3 is the whole match and group 4 is the digits.

5. ((?<!\\)-------\s*\n)?  
  Optionally matches the “-------” marker line (group 5).

6. ([\s\S]*?)(?:\n)?  
  Non‐greedy match for the “search content” (group 6) up to the next marker.

7. (?:(?<=\n)(?<!\\)=======\s*\n)  
  Matches the “=======” marker on its own line.

8. ([\s\S]*?)(?:\n)?  
  Non‐greedy match for the “replace content” (group 7).

9. (?:(?<=\n)(?<!\\)>>>>>>> REPLACE)(?=\n|$)  
  Matches the final “>>>>>>> REPLACE” marker on its own line (and requires a following newline or the end of file).
*/

export const DIFF_CONTENT_REGEX =
  /(?:^|\n)(?<!\\)<<<<<<< SEARCH>?\s*\n((?::start_line:\s*(\d+)\s*\n))?((?::end_line:\s*(\d+)\s*\n))?((?<!\\)-------\s*\n)?([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)=======\s*\n)([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)>>>>>>> REPLACE)(?=\n|$)/g

export function getReplacements(diffBlock: string) {
  const matches = Array.from(diffBlock.matchAll(DIFF_CONTENT_REGEX))

  const replacements = matches
    .map((match) => ({
      startLine: Number(match[2] ?? 0),
      searchContent: match[6],
      replaceContent: match[7],
    }))
    .sort((a, b) => a.startLine - b.startLine)

  return replacements
}

export const emptyReplacementErrorMesssage = `Invalid diff block: No valid replacements found in the diff block
Debug Info:
- Expacted format:  <<<<<<< SEARCH\n:start_line: start line\n-------\n[search content]\n=======\n[replace content]\n>>>>>>> REPLACE
- Tip: Make sure to include start_line/SEARCH/=======/REPLACE sections with correct markers on new lines
`

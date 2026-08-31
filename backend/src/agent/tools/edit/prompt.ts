export const prompt = `Make precise, targeted changes to an existing file by searching for exact sections of content and replacing them. Returns which blocks applied and which failed.

WHEN TO USE: changing lines in a file that already exists - fixing a bug,
  renaming a symbol in place, adjusting a parameter, adding a function to a
  module that is already there.

WHEN NOT TO USE: creating a file that does not exist yet (use create instead).
  Editing a file you have not read (read it first - the SEARCH text has to
  match what is actually on disk). Rewriting a whole file top to bottom - send
  blocks covering only what changes.

DO NOT USE FOR: creating files (use create), \`sed -i\` or other in-place edits
  through the shell (use this tool), reading files (use read), searching for
  the text you mean to change (use grep first).

USAGE: \`path\` is relative to the project directory and the file must already
  exist. Put as many SEARCH/REPLACE blocks in a single call as the change
  needs; that is cheaper and safer than one call per block, because every block
  is matched against the same starting file.
- The SEARCH section must match the existing content exactly, including
  whitespace and indentation. If you are not certain of the exact text, read
  the file first.
- \`:start_line:\` is required. It is where the search block starts in the file
  as you last read it; nearby lines are searched too, so an edit still lands if
  the line has shifted.
- Blocks apply independently. If one fails to match, the others are still
  written and the failure is reported - re-read the file before retrying, since
  the line numbers will have moved.
- Indentation of the replacement is rebased onto the file, so the block only
  has to be internally consistent.
- Watch for closing brackets and other syntax further down the file that your
  change affects.
- If the code itself contains \`<<<<<<<\`, \`=======\`, \`>>>>>>> REPLACE\` or
  \`-------\` at the start of a line, escape those lines with a leading
  backslash inside SEARCH/REPLACE content.

DIFF FORMAT:
\`\`\`
<<<<<<< SEARCH
:start_line: (required) The line number of original content where the search block starts.
-------
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
\`\`\`

EXAMPLES - original content:
\`\`\`
1 | function calculateTotal(items) {
2 |   let total = 0;
3 |   for (let i = 0; i < items.length; i++) {
4 |     total += items[i].price;
5 |   }
6 |   return total;
7 | }
\`\`\`

A single edit:
\`\`\`
<<<<<<< SEARCH
:start_line:2
-------
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
=======
  return items.reduce((total, item) => total + item.price, 0);
>>>>>>> REPLACE
\`\`\`

Several edits in one call:
\`\`\`
<<<<<<< SEARCH
:start_line:1
-------
function calculateTotal(items) {
  let total = 0;
=======
function calculateSum(items) {
  let sum = 0;
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:4
-------
    total += items[i].price;
  }
  return total;
=======
    sum += items[i].price;
  }
  return sum;
>>>>>>> REPLACE
\`\`\`
`

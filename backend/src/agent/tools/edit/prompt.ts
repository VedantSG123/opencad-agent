export const prompt = `Make precise, targeted changes to an existing file by searching for exact sections of content and replacing them. This tool is for surgical edits only - it changes parts of a file, it does not create or rewrite one.

Put as many SEARCH/REPLACE blocks in a single call as the change needs; that is cheaper and safer than one call per block, because every block is matched against the same starting file.

Usage notes:
- \`path\` is relative to the project directory and the file must already exist.
- The SEARCH section must match the existing content exactly, including whitespace and indentation. If you are not certain of the exact text, read the file first.
- \`:start_line:\` is required. It is where the search block starts in the file as you last read it; nearby lines are searched too, so an edit still lands if the line has shifted.
- Blocks apply independently. If one fails to match, the others are still written and the failure is reported - re-read the file before retrying, since the line numbers will have moved.
- Indentation of the replacement is rebased onto the file, so the block only has to be internally consistent.
- Watch for closing brackets and other syntax further down the file that your change affects.
- If the code itself contains \`<<<<<<<\`, \`=======\`, \`>>>>>>> REPLACE\` or \`-------\` at the start of a line, escape those lines with a leading backslash inside SEARCH/REPLACE content.

Diff format:
\`\`\`
<<<<<<< SEARCH
:start_line: (required) The line number of original content where the search block starts.
-------
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
\`\`\`

Example - original content:
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

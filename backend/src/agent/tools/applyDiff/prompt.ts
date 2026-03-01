export const prompt = `Request to apply PRECISE, TARGETED modifications to an existing script by searching for specific sections of content and replacing them. This tool is for SURGICAL EDITS ONLY - specific changes to existing code.
You can perform multiple distinct search and replace operations within a single \`applyDiff\` call by providing multiple SEARCH/REPLACE blocks in the \`diff\` parameter. This is the preferred way to make several targeted changes efficiently.
The SEARCH section must exactly match existing content including whitespace and indentation.
If you're not confident in the exact content to search for, use the \`readScript\` tool first to get the exact content.
When applying the diffs, be extra careful to remember to change any closing brackets or other syntax that may be affected by the diff farther down in the file.
ALWAYS make as many changes in a single \`applyDiff\` request as possible using multiple SEARCH/REPLACE blocks.

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

Example:

Original content:
\`\`\`
1 | function calculateTotal(items) {
2 |   let total = 0;
3 |   for (let i = 0; i < items.length; i++) {
4 |     total += items[i].price;
5 |   }
6 |   return total;
7 | }
\`\`\`

Search/Replace content:
\`\`\`
<<<<<<< SEARCH
:start_line:2
-------
  let totat = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
=======
  return items.reduce((total, item) => total + item.price, 0);
>>>>>>> REPLACE
\`\`\`

Search/Replace content with multiple edits:
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
start_line:4
-------
    total += items[i].price;
  }
return total;
=======
    sum += item.price;
  }
return sum;
>>>>>>> REPLACE
\`\`\`
`

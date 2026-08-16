/**
 * Undoes the leading backslash the prompt asks for when the code being edited
 * contains diff markers of its own. Runs after parsing, so an escaped marker
 * never ends a block but still reaches the file verbatim.
 */
export function unescapeMarkers(content: string): string {
  return content
    .replace(/^\\<<<<<<</gm, '<<<<<<<')
    .replace(/^\\=======/gm, '=======')
    .replace(/^\\>>>>>>>/gm, '>>>>>>>')
    .replace(/^\\-------/gm, '-------')
    .replace(/^\\:end_line:/gm, ':end_line:')
    .replace(/^\\:start_line:/gm, ':start_line:')
}

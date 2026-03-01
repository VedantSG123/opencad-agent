export function unescapeMarkers(content: string): string {
  return content
    .replace(/^\\<<<<<<</gm, '<<<<<<<')
    .replace(/^\\=======/gm, '=======')
    .replace(/^\\>>>>>>>/gm, '>>>>>>>')
    .replace(/^\\-------/gm, '-------')
    .replace(/^\\:end_line:/gm, ':end_line:')
    .replace(/^\\:start_line:/gm, ':start_line:')
}

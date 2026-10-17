const MB = 1024 * 1024

export type AttachmentKind = 'image' | 'pdf'

export type AttachmentCapabilities = Record<AttachmentKind, boolean>

type AcceptedType = { kind: AttachmentKind; extensions: string[] }

const ACCEPTED_TYPES = new Map<string, AcceptedType>([
  ['image/png', { kind: 'image', extensions: ['.png'] }],
  ['image/jpeg', { kind: 'image', extensions: ['.jpg', '.jpeg'] }],
  ['image/webp', { kind: 'image', extensions: ['.webp'] }],
  ['image/gif', { kind: 'image', extensions: ['.gif'] }],
  ['application/pdf', { kind: 'pdf', extensions: ['.pdf'] }],
])

const KIND_PLURAL = {
  image: 'images',
  pdf: 'PDFs',
} satisfies Record<AttachmentKind, string>

export const ACCEPTED_EXTENSIONS = [...ACCEPTED_TYPES.values()]
  .flatMap((type) => type.extensions)
  .join(',')

export const MAX_ATTACHMENTS_PER_MESSAGE = 5

/**
 * Decoded bytes, not the length of the data URI. Providers cap the encoded
 * payload lower than this in places, so a file inside the limit can still be
 * refused upstream - that refusal arrives on the stream.
 */
export const MAX_ATTACHMENT_BYTES = 10 * MB

export const MAX_ATTACHMENTS_TOTAL_BYTES = 2 * MAX_ATTACHMENT_BYTES

export type Attachment = {
  mime: string
  /** A `data:` URI. */
  url: string
  filename?: string
}

type DataUri = { mime: string | null; bytes: number }

export function parseDataUri(url: string): DataUri | null {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma === -1) return null

  const [mime, ...params] = url.slice('data:'.length, comma).split(';')
  const payload = url.slice(comma + 1)

  if (!params.includes('base64')) {
    return { mime: mime || null, bytes: payload.length }
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return {
    mime: mime || null,
    bytes: Math.floor((payload.length * 3) / 4) - padding,
  }
}

export function base64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3)
}

/**
 * `null` when the file may be sent, otherwise why not - in words meant for the
 * person who attached it.
 *
 * Both the composer and the route ask this, so the button is disabled for
 * exactly the files the backend would refuse.
 */
export function attachmentRefusal(
  file: Attachment,
  capabilities: AttachmentCapabilities,
): string | null {
  const name = file.filename ?? file.mime

  const type = ACCEPTED_TYPES.get(file.mime)
  if (!type) {
    const kinds = Object.values(KIND_PLURAL).join(' and ')
    return `${name} is a ${file.mime} file. Only ${kinds} can be attached (${ACCEPTED_EXTENSIONS}).`
  }

  if (!capabilities[type.kind]) {
    return `This model cannot read ${KIND_PLURAL[type.kind]}. Pick one that can, or send ${name} as text.`
  }

  const data = parseDataUri(file.url)
  if (data === null) return `${name} was not sent as a data URI.`

  // A mismatch means the declared type and the bytes disagree, and the
  // capability check above was made against the wrong one.
  if (data.mime !== null && data.mime !== file.mime) {
    return `${name} says it is ${file.mime} but its data is ${data.mime}.`
  }

  if (data.bytes > MAX_ATTACHMENT_BYTES) {
    // Two sentences rather than "X, over the Y limit": a file a hair over the
    // limit renders both numbers the same, and the comparison reads as a lie.
    return `${name} is ${formatBytes(data.bytes)}. Attachments are limited to ${formatBytes(MAX_ATTACHMENT_BYTES)} each.`
  }

  return null
}

export function attachmentSetRefusal(files: Attachment[]): string | null {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return `${files.length} attachments is over the limit of ${MAX_ATTACHMENTS_PER_MESSAGE} per message.`
  }

  const total = files.reduce(
    (sum, file) => sum + (parseDataUri(file.url)?.bytes ?? 0),
    0,
  )
  if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
    return `These attachments come to ${formatBytes(total)}. One message is limited to ${formatBytes(MAX_ATTACHMENTS_TOTAL_BYTES)} in total.`
  }

  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

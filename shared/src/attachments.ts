export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const PDF_MIME_TYPE = 'application/pdf'

export const ACCEPTED_MIME_TYPES: readonly string[] = [
  ...IMAGE_MIME_TYPES,
  PDF_MIME_TYPE,
]

/** For a file input's `accept`, and for the message when one is refused. */
export const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp,.gif,.pdf'

/**
 * Decoded bytes, not the length of the data URI. Providers cap the encoded
 * payload lower than this in places, so a file inside the limit can still be
 * refused upstream - that refusal arrives on the stream.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export const MAX_ATTACHMENTS_TOTAL_BYTES = 20 * 1024 * 1024

export const MAX_ATTACHMENTS_PER_MESSAGE = 5

/** What a model can be sent, read off `capabilities.input`. */
export type AttachmentCapabilities = {
  image: boolean
  pdf: boolean
}

export type Attachment = {
  mime: string
  /** A `data:` URI. The bytes travel inline; nothing is stored out of band. */
  url: string
  filename?: string
}

/**
 * The bytes a `data:` URI carries, or `null` if it is not one.
 *
 * Counted from the base64 rather than taken on trust: the size is the thing
 * being limited, so a caller must not be able to declare it.
 */
export function dataUriBytes(url: string): number | null {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma === -1) return null

  const header = url.slice(5, comma)
  const payload = url.slice(comma + 1)

  if (!header.includes(';base64')) return payload.length
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

export function declaredMime(url: string): string | null {
  if (!url.startsWith('data:')) return null
  const header = url.slice(5, url.indexOf(','))
  const mime = header.split(';')[0]
  return mime || null
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

  if (!ACCEPTED_MIME_TYPES.includes(file.mime)) {
    return `${name} is a ${file.mime} file. Only images and PDFs can be attached (${ACCEPTED_EXTENSIONS}).`
  }

  const needs = file.mime === PDF_MIME_TYPE ? 'pdf' : 'image'
  if (!capabilities[needs]) {
    return `This model cannot read ${needs === 'pdf' ? 'PDFs' : 'images'}. Pick one that can, or send ${name} as text.`
  }

  const bytes = dataUriBytes(file.url)
  if (bytes === null) return `${name} was not sent as a data URI.`

  // A mismatch means the declared type and the bytes disagree, and the
  // capability check above was made against the wrong one.
  const declared = declaredMime(file.url)
  if (declared !== null && declared !== file.mime) {
    return `${name} says it is ${file.mime} but its data is ${declared}.`
  }

  if (bytes > MAX_ATTACHMENT_BYTES) {
    // Two sentences rather than "X, over the Y limit": a file a hair over the
    // limit renders both numbers the same, and the comparison reads as a lie.
    return `${name} is ${formatBytes(bytes)}. Attachments are limited to ${formatBytes(MAX_ATTACHMENT_BYTES)} each.`
  }

  return null
}

/** `null` when the set may be sent together. Counts and total size only. */
export function attachmentSetRefusal(files: Attachment[]): string | null {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return `${files.length} attachments is over the limit of ${MAX_ATTACHMENTS_PER_MESSAGE} per message.`
  }

  const total = files.reduce(
    (sum, file) => sum + (dataUriBytes(file.url) ?? 0),
    0,
  )
  if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
    return `These attachments come to ${formatBytes(total)}. One message is limited to ${formatBytes(MAX_ATTACHMENTS_TOTAL_BYTES)} in total.`
  }

  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

import { describe, expect, test } from 'bun:test'

import type { Attachment, AttachmentCapabilities } from 'shared'
import {
  attachmentRefusal,
  attachmentSetRefusal,
  dataUriBytes,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENTS_TOTAL_BYTES,
} from 'shared'

const MULTIMODAL: AttachmentCapabilities = { image: true, pdf: true }
const TEXT_ONLY: AttachmentCapabilities = { image: false, pdf: false }
const IMAGES_ONLY: AttachmentCapabilities = { image: true, pdf: false }

/** A data URI whose base64 decodes to exactly `bytes` bytes. */
function dataUri(mime: string, bytes: number): string {
  const groups = Math.ceil(bytes / 3)
  const padding = groups * 3 - bytes
  const payload = 'A'.repeat(groups * 4 - padding) + '='.repeat(padding)
  return `data:${mime};base64,${payload}`
}

function file(mime: string, bytes = 1024, filename = 'ref.png'): Attachment {
  return { mime, filename, url: dataUri(mime, bytes) }
}

describe('dataUriBytes', () => {
  test('counts the decoded bytes, not the encoded length', () => {
    // "hello" is 5 bytes; its base64 is 8 characters.
    const bytes = dataUriBytes('data:image/png;base64,aGVsbG8=')
    expect(bytes).toBe(5)
  })

  test('anything that is not a data URI is refused rather than guessed at', () => {
    expect(dataUriBytes('https://example.com/a.png')).toBeNull()
    expect(dataUriBytes('not a uri')).toBeNull()
  })
})

describe('attachmentRefusal', () => {
  test('an image passes a model that reads images', () => {
    expect(attachmentRefusal(file('image/png'), MULTIMODAL)).toBeNull()
  })

  test('a PDF is refused by a model that reads images but not PDFs', () => {
    const refusal = attachmentRefusal(
      file('application/pdf', 1024, 'drawing.pdf'),
      IMAGES_ONLY,
    )
    expect(refusal).toContain('cannot read PDFs')
  })

  test('every attachment is refused by a text-only model', () => {
    expect(attachmentRefusal(file('image/png'), TEXT_ONLY)).toContain(
      'cannot read images',
    )
  })

  test('an unsupported type is refused whatever the model can do', () => {
    const refusal = attachmentRefusal(
      {
        mime: 'model/stl',
        filename: 'part.stl',
        url: dataUri('model/stl', 10),
      },
      MULTIMODAL,
    )
    expect(refusal).toContain('Only images and PDFs')
  })

  test('a file over the per-file limit is refused with its size', () => {
    const refusal = attachmentRefusal(
      file('image/png', MAX_ATTACHMENT_BYTES + 1024),
      MULTIMODAL,
    )
    expect(refusal).toContain('Attachments are limited to')
  })

  test('a file exactly at the limit is allowed', () => {
    expect(
      attachmentRefusal(file('image/png', MAX_ATTACHMENT_BYTES), MULTIMODAL),
    ).toBeNull()
  })

  test('bytes that are not a data URI are refused', () => {
    const refusal = attachmentRefusal(
      {
        mime: 'image/png',
        filename: 'ref.png',
        url: 'https://example.com/a.png',
      },
      MULTIMODAL,
    )
    expect(refusal).toContain('not sent as a data URI')
  })

  test('a mime that disagrees with its own payload is refused', () => {
    // Declared as an image the model can read, carrying something else - the
    // capability check above would have been made against the wrong type.
    const refusal = attachmentRefusal(
      {
        mime: 'image/png',
        filename: 'ref.png',
        url: dataUri('application/pdf', 100),
      },
      IMAGES_ONLY,
    )
    expect(refusal).toContain('says it is image/png')
  })
})

describe('attachmentSetRefusal', () => {
  test('a normal set passes', () => {
    expect(
      attachmentSetRefusal([file('image/png'), file('image/jpeg')]),
    ).toBeNull()
  })

  test('too many files is refused', () => {
    const many = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, () =>
      file('image/png'),
    )
    expect(attachmentSetRefusal(many)).toContain('over the limit of')
  })

  test('files that each pass but together exceed the total are refused', () => {
    // Three at 80% of the per-file limit: each allowed, 2.4x the per-file cap
    // together, which is what the total limit exists to catch.
    const each = Math.floor(MAX_ATTACHMENT_BYTES * 0.8)
    const set = [
      file('image/png', each),
      file('image/png', each),
      file('image/png', each),
    ]

    for (const one of set) {
      expect(attachmentRefusal(one, MULTIMODAL)).toBeNull()
    }
    expect(each * set.length).toBeGreaterThan(MAX_ATTACHMENTS_TOTAL_BYTES)
    expect(attachmentSetRefusal(set)).toContain('limited to')
  })
})

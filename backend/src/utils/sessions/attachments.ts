import { Attachment } from 'shared'
import { attachmentRefusal, attachmentSetRefusal } from 'shared'

import { Model } from '../../models/schemas'

/** The first thing wrong with the attachments, or `null` if nothing is. */
export function attachmentsRefusal(
  files: Attachment[],
  model: Model,
): string | null {
  const capabilities = {
    image: model.capabilities.input.image,
    pdf: model.capabilities.input.pdf,
  }

  for (const file of files) {
    const refusal = attachmentRefusal(file, capabilities)
    if (refusal) return refusal
  }

  return attachmentSetRefusal(files)
}

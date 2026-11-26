import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MessageReference, Reference } from 'shared/references'
import { referenceLink } from 'shared/references'

import { ReferenceChip, referenceLabel } from './ReferenceChip'

export interface PromptEditorHandle {
  insertReference: (reference: Reference) => void
  read: () => { text: string; references: MessageReference[] }
  clear: () => void
}

/**
 * A text box that holds references as atomic chips among the words.
 *
 * The DOM is the draft: React renders the box once and never its contents,
 * since a contenteditable that React re-renders loses the caret. A chip names
 * its reference by `data-reference`, a key into `references` that is the same
 * for the same selection, so mentioning it twice sends it once.
 */
export function PromptEditor({
  ref,
  initialText,
  autoFocus,
  placeholder,
  onChange,
  onSubmit,
}: {
  ref: React.Ref<PromptEditorHandle>
  initialText: string
  autoFocus: boolean
  placeholder: string
  onChange: (hasContent: boolean) => void
  onSubmit: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const references = useRef(new Map<string, Reference>())
  const caret = useRef<Range | null>(null)
  const [isEmpty, setIsEmpty] = useState(!initialText)

  useEffect(() => {
    const el = box.current
    if (!el) return
    el.textContent = initialText
    if (autoFocus) el.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clicking the viewport moves the selection out of the box, so the caret to
  // insert at is the last one seen inside it.
  useEffect(() => {
    function remember() {
      const selection = document.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      if (range && box.current?.contains(range.commonAncestorContainer)) {
        caret.current = range.cloneRange()
      }
    }
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [])

  function changed() {
    const el = box.current
    const hasContent = Boolean(
      el && (el.textContent?.trim() || el.querySelector('[data-reference]')),
    )
    setIsEmpty(!hasContent)
    onChange(hasContent)
  }

  useImperativeHandle(ref, () => ({
    insertReference(reference) {
      const el = box.current
      if (!el) return
      const key = JSON.stringify(reference)
      references.current.set(key, reference)

      const chip = document.createElement('span')
      chip.contentEditable = 'false'
      chip.dataset.reference = key
      chip.innerHTML = renderToStaticMarkup(
        <ReferenceChip reference={reference} />,
      )
      const after = document.createTextNode(' ')

      const range = caret.current ?? endOf(el)
      range.deleteContents()
      range.insertNode(after)
      range.insertNode(chip)

      el.focus()
      const next = document.createRange()
      next.setStartAfter(after)
      next.collapse(true)
      document.getSelection()?.removeAllRanges()
      document.getSelection()?.addRange(next)
      caret.current = next.cloneRange()
      changed()
    },
    read: () => serialize(box.current, references.current),
    clear() {
      if (box.current) box.current.textContent = ''
      references.current.clear()
      caret.current = null
      changed()
    },
  }))

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      onSubmit()
    }
  }

  // Pasted HTML would bring its own markup into the box; only its text is
  // wanted. `insertText` keeps the paste on the browser's undo stack.
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  return (
    <div className='relative'>
      {isEmpty && (
        <p className='pointer-events-none absolute inset-x-3 top-3 text-sm text-foreground/40 select-none'>
          {placeholder}
        </p>
      )}
      <div
        ref={box}
        role='textbox'
        aria-multiline='true'
        aria-label={placeholder}
        contentEditable
        suppressContentEditableWarning
        onInput={changed}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDrop={(event) => event.preventDefault()}
        className='max-h-48 min-h-14 w-full overflow-y-auto px-3 pt-3 pb-1 text-sm break-words whitespace-pre-wrap text-foreground outline-none'
      />
    </div>
  )
}

function endOf(el: HTMLElement): Range {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  return range
}

/**
 * Chromium writes a line break as `<br>` or wraps the new line in a `<div>`,
 * depending on how it was typed; both read back as `\n`.
 */
function serialize(
  root: HTMLElement | null,
  known: Map<string, Reference>,
): { text: string; references: MessageReference[] } {
  const ids = new Map<string, number>()
  const references: MessageReference[] = []
  let text = ''

  function walk(node: Node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? ''
        continue
      }
      if (!(child instanceof HTMLElement)) continue
      const key = child.dataset.reference
      const reference = key === undefined ? undefined : known.get(key)
      if (key !== undefined && reference) {
        let id = ids.get(key)
        if (id === undefined) {
          id = ids.size + 1
          ids.set(key, id)
          references.push({ id, ref: reference })
        }
        text += referenceLink(referenceLabel(reference), id)
        continue
      }
      if (child.tagName === 'BR') {
        text += '\n'
        continue
      }
      if (
        (child.tagName === 'DIV' || child.tagName === 'P') &&
        text &&
        !text.endsWith('\n')
      ) {
        text += '\n'
      }
      walk(child)
    }
  }

  if (root) walk(root)
  return { text: text.trim(), references }
}

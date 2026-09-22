import type { Mark, Span } from '@govtech-bb/block-kit'
import { useEffect, useRef } from 'react'

/**
 * Inline editing with a mark toolbar, over a contentEditable that
 * serialises straight to `Span[]`.
 *
 * Deliberately not Lexical. The brief allows Lexical with a block ↔ editor
 * state adapter, but forbids storing Lexical's editor state as canonical —
 * it carries `detail`, `format`, `mode`, `style`, `version` and `direction`
 * on every node and is versioned to Lexical, not to us. Given that the
 * canonical form has to be `Span[]` either way, and the spike needs three
 * marks and no collaborative cursor, the adapter is the whole job and
 * Lexical is all cost. `apps/form_builder` already proves the Lexical route
 * works when the richer surface is actually wanted.
 *
 * `document.execCommand` is deprecated and still the shortest correct path
 * to "apply bold to the selection" in every browser. A spike is exactly
 * where that trade is worth taking.
 */

const MARK_TAGS: Record<Mark, string> = {
  strong: 'STRONG',
  em: 'EM',
  code: 'CODE',
}

function spansToHtml(spans: Span[]): string {
  return (
    spans
      .map((span) => {
        const text = (span.text ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        return (span.marks ?? []).reduce(
          (inner, mark) =>
            `<${MARK_TAGS[mark].toLowerCase()}>${inner}</${MARK_TAGS[mark].toLowerCase()}>`,
          text,
        )
      })
      .join('') || ''
  )
}

/** Walks the DOM, collecting marks from the ancestors of each text node. */
function htmlToSpans(root: HTMLElement): Span[] {
  const spans: Span[] = []

  const walk = (node: Node, marks: Mark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text) return
      const previous = spans[spans.length - 1]
      // Merge adjacent runs carrying the same marks, so typing inside a
      // bold run does not fragment the document.
      if (
        previous &&
        JSON.stringify(previous.marks ?? []) === JSON.stringify(marks)
      ) {
        previous.text = (previous.text ?? '') + text
        return
      }
      spans.push(marks.length > 0 ? { text, marks: [...marks] } : { text })
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.tagName === 'BR') return

    const mark = (Object.keys(MARK_TAGS) as Mark[]).find(
      (candidate) =>
        MARK_TAGS[candidate] === element.tagName ||
        (candidate === 'strong' && element.tagName === 'B') ||
        (candidate === 'em' && element.tagName === 'I'),
    )
    const next = mark && !marks.includes(mark) ? [...marks, mark] : marks
    element.childNodes.forEach((child) => walk(child, next))
  }

  root.childNodes.forEach((child) => walk(child, []))
  return spans.length > 0 ? spans : [{ text: '' }]
}

export function SpanEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: Span[]
  onChange: (spans: Span[]) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Seeded once. The editor owns the draft while it is mounted, so props
  // are never written back into the DOM mid-edit — that is what would move
  // the caret. Remounting on block id change is handled by the caller's key.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = spansToHtml(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => {
    if (ref.current) onChange(htmlToSpans(ref.current))
  }

  const applyMark = (mark: Mark) => {
    ref.current?.focus()
    if (mark === 'code') {
      const selection = window.getSelection()
      const text = selection?.toString()
      if (text) document.execCommand('insertHTML', false, `<code>${text}</code>`)
    } else {
      document.execCommand(mark === 'strong' ? 'bold' : 'italic')
    }
    emit()
  }

  return (
    <div className="ed-span-editor">
      <div className="ed-marks" role="toolbar" aria-label="Formatting">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMark('strong')} aria-label="Bold"><b>B</b></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMark('em')} aria-label="Italic"><i>I</i></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMark('code')} aria-label="Code"><code>{'<>'}</code></button>
      </div>
      <div
        ref={ref}
        className="ed-contenteditable"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={emit}
        onBlur={emit}
        onPaste={(event) => {
          // Paste as plain text: the palette is closed, so arbitrary pasted
          // markup has nowhere to go in the document model.
          event.preventDefault()
          const text = event.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
        }}
      />
    </div>
  )
}

export { htmlToSpans, spansToHtml }

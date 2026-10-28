import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useReadOnly } from '../readonly'

interface Props {
  html: string
  onChange: (html: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  placeholder?: string
  className?: string
  plain?: boolean
  blockId?: string
  onFocus?: () => void
  onBlur?: () => void
  /** gets first look at pasted text; return true when it was handled */
  onPasteText?: (text: string) => boolean
}

export const cleanHtml = (h: string) => (h === '<br>' ? '' : h)

/** Uncontrolled contentEditable: only writes the DOM when the value changes from outside. */
export const Editable = forwardRef<HTMLDivElement, Props>(function Editable(
  { html, onChange, onKeyDown, placeholder, className, plain, blockId, onFocus, onBlur, onPasteText }, ref,
) {
  const el = useRef<HTMLDivElement>(null)
  const readOnly = useReadOnly()
  useImperativeHandle(ref, () => el.current!)

  useEffect(() => {
    const node = el.current
    if (!node) return
    const current = plain ? node.innerText : node.innerHTML
    if (cleanHtml(current) !== html && document.activeElement !== node) {
      if (plain) node.innerText = html
      else node.innerHTML = html
    }
  }, [html, plain])

  return (
    <div
      ref={el}
      className={`editable ${className ?? ''}`}
      contentEditable={readOnly ? false : plain ? ('plaintext-only' as any) : true}
      suppressContentEditableWarning
      spellCheck
      data-placeholder={readOnly ? undefined : placeholder}
      data-block-id={blockId}
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={e => {
        const node = e.currentTarget
        if (!plain && node.innerHTML === '<br>') node.innerHTML = ''
        onChange(plain ? node.innerText : cleanHtml(node.innerHTML))
      }}
      onKeyDown={onKeyDown}
      onPaste={e => {
        // paste as plain text to keep the document clean
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        if (!plain && onPasteText?.(text)) return
        document.execCommand('insertText', false, text)
      }}
    />
  )
})

export function placeCaret(node: HTMLElement, at: 'start' | 'end') {
  node.focus()
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(at === 'start')
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

function caretTextOffset(node: HTMLElement, side: 'before' | 'after') {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return -1
  const r = sel.getRangeAt(0)
  const probe = document.createRange()
  probe.selectNodeContents(node)
  if (side === 'before') probe.setEnd(r.startContainer, r.startOffset)
  else probe.setStart(r.endContainer, r.endOffset)
  return probe.toString().length
}

export const caretAtStart = (node: HTMLElement) => caretTextOffset(node, 'before') === 0
export const caretAtEnd = (node: HTMLElement) => caretTextOffset(node, 'after') === 0

/** Cuts everything after the caret out of `node` and returns it as HTML. */
export function splitAtCaret(node: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return ''
  const r = sel.getRangeAt(0)
  r.deleteContents()
  const after = document.createRange()
  after.selectNodeContents(node)
  after.setStart(r.endContainer, r.endOffset)
  const tmp = document.createElement('div')
  tmp.appendChild(after.extractContents())
  return cleanHtml(tmp.innerHTML)
}

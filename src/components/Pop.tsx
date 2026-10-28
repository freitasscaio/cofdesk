import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])'

/** Small popover anchored to its trigger; closes on outside click or Escape. */
export function Pop({ trigger, children, width = 240 }: {
  trigger: (open: (e: React.MouseEvent) => void) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  width?: number
}) {
  const [pos, setPos] = useState<{ x: number; y?: number; bottom?: number; keyboard: boolean; label: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setPos(null) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPos(null); opener.current?.focus() }
    }
    // opened from the keyboard: move focus into the popover (unless a field in it already took it)
    if (pos.keyboard) setTimeout(() => {
      if (box.current && !box.current.contains(document.activeElement)) box.current.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    })
    setTimeout(() => window.addEventListener('mousedown', onDown))
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [pos])

  const open = (e: React.MouseEvent) => {
    e.stopPropagation()
    opener.current = e.currentTarget as HTMLElement
    const r = opener.current.getBoundingClientRect()
    // a click made with Enter or Space has no mouse clicks (detail 0)
    // near the bottom of the window (the account button), open upwards
    const up = r.top > window.innerHeight * 0.6
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { y: r.bottom + 4 }), keyboard: e.detail === 0,
      label: opener.current.getAttribute('aria-label') || opener.current.title || opener.current.textContent?.trim() || 'Menu' })
  }

  return (
    <>
      {trigger(open)}
      {pos && createPortal(
        <div ref={box} className="popover" role="dialog" aria-label={pos.label} style={{ left: pos.x, top: pos.y, bottom: pos.bottom, width }} onClick={e => e.stopPropagation()}>
          {children(() => { setPos(null); if (pos.keyboard) opener.current?.focus() })}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Popover at a fixed point (context menus); closes on outside click or Escape. */
export function FloatMenu({ x, y, onClose, children, width = 240 }: { x: number; y: number; onClose: () => void; children: React.ReactNode; width?: number }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => window.addEventListener('mousedown', onDown))
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [onClose])
  return createPortal(
    <div ref={box} className="popover" role="dialog" aria-label="Menu" style={{ left: Math.min(x, innerWidth - width - 8), top: Math.min(y, innerHeight - 280), width }}
      onMouseDown={e => e.preventDefault()} onClick={e => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  )
}

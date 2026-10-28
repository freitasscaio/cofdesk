import { useCallback, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { Block } from '../types'
import { useReadOnly } from '../readonly'
import { Editable, placeCaret } from './Editable'
import { FloatMenu } from './Pop'

export const emptyTable = (rows = 3, cols = 3) => Array.from({ length: rows }, () => Array(cols).fill(''))

type Cell = { r: number; c: number }

/** Notion-style simple table: a grid of rich-text cells with an optional header row. */
export function TableBlock({ block, onChange }: { block: Block; onChange: (rows: string[][]) => void }) {
  const rows = block.rows?.length ? block.rows : emptyTable()
  const readOnly = useReadOnly()
  const root = useRef<HTMLTableElement>(null)
  const [menu, setMenu] = useState<(Cell & { x: number; y: number }) | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  // edits made inside one cell must not drop edits of the others, so always build from the latest rows
  const latest = useRef(rows)
  latest.current = rows

  const cellNode = (r: number, c: number) => root.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"] .editable`)
  const focusCell = (r: number, c: number) => setTimeout(() => { const n = cellNode(r, c); if (n) placeCaret(n, 'end') })
  const set = (next: string[][]) => onChange(next)

  const setCell = (r: number, c: number, html: string) =>
    set(latest.current.map((row, i) => (i === r ? row.map((v, j) => (j === c ? html : v)) : row)))
  const addRow = (at: number) => set([...latest.current.slice(0, at), Array(latest.current[0].length).fill(''), ...latest.current.slice(at)])
  const addCol = (at: number) => set(latest.current.map(row => [...row.slice(0, at), '', ...row.slice(at)]))
  const delRow = (r: number) => latest.current.length > 1 && set(latest.current.filter((_, i) => i !== r))
  const delCol = (c: number) => latest.current[0].length > 1 && set(latest.current.map(row => row.filter((_, j) => j !== c)))

  const onKey = (r: number, c: number, e: React.KeyboardEvent<HTMLDivElement>) => {
    const R = latest.current.length, C = latest.current[0].length
    if (e.key === 'Tab') {
      e.preventDefault()
      const i = r * C + c + (e.shiftKey ? -1 : 1)
      if (i >= R * C) { addRow(R); focusCell(R, 0) } else if (i >= 0) focusCell(Math.floor(i / C), i % C)
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (r + 1 >= R) addRow(R)
      focusCell(r + 1, c)
    }
  }

  return (
    <div className="stable-wrap">
      <div className="stable-scroll">
        <table className={`stable ${block.header ? 'with-header' : ''}`} ref={root}>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((html, c) => {
                  const Tag = block.header && r === 0 ? 'th' : 'td'
                  return (
                    <Tag key={c} onContextMenu={e => { if (readOnly) return; e.preventDefault(); setMenu({ r, c, x: e.clientX, y: e.clientY }) }}>
                      <CellEditable r={r} c={c} html={html} onChange={h => setCell(r, c, h)} onKeyDown={e => onKey(r, c, e)} />
                    </Tag>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && <button className="stable-add col" title="Adicionar coluna" onClick={() => addCol(rows[0].length)}><Plus size={14} /></button>}
      </div>
      {!readOnly && <button className="stable-add row" title="Adicionar linha" onClick={() => addRow(rows.length)}><Plus size={14} /></button>}

      {menu && (
        <FloatMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          {([
            [ArrowUp, 'Inserir linha acima', () => addRow(menu.r)],
            [ArrowDown, 'Inserir linha abaixo', () => addRow(menu.r + 1)],
            [ArrowLeft, 'Inserir coluna à esquerda', () => addCol(menu.c)],
            [ArrowRight, 'Inserir coluna à direita', () => addCol(menu.c + 1)],
            [Trash2, 'Excluir linha', () => delRow(menu.r)],
            [Trash2, 'Excluir coluna', () => delCol(menu.c)],
          ] as const).map(([Icon, label, run]) => (
            <button key={label} className="menu-item" onClick={() => { run(); setMenu(null) }}><Icon size={16} /> {label}</button>
          ))}
        </FloatMenu>
      )}
    </div>
  )
}

function CellEditable({ r, c, ...props }: { r: number; c: number; html: string; onChange: (h: string) => void; onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void }) {
  return <div data-cell={`${r}:${c}`} style={{ display: 'contents' }}><Editable {...props} className="cell-edit" /></div>
}

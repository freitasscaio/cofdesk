import type { Block } from './types'

// Helpers for the block tree. A page keeps a flat block list where nesting is expressed with
// `indent`; the only real containers are column blocks, whose `cols` hold their own flat lists.

/** Which list an editor works on: the page itself, or one column of a columns block. */
export type ColRef = { blockId: string; index: number }

export const depth = (b: Block) => b.indent ?? 0

export function listAt(top: Block[], col?: ColRef): Block[] {
  if (!col) return top
  return top.find(b => b.id === col.blockId)?.cols?.[col.index] ?? []
}

export function withList(top: Block[], col: ColRef | undefined, list: Block[]): Block[] {
  if (!col) return list
  return top.map(b => (b.id === col.blockId ? { ...b, cols: (b.cols ?? []).map((c, i) => (i === col.index ? list : c)) } : b))
}

/** Drops empty columns and unwraps a columns block that is down to a single column. */
export function normalize(top: Block[]): Block[] {
  return top.flatMap(b => {
    if (b.type !== 'columns') return [b]
    const cols = (b.cols ?? []).filter(c => c.length)
    if (cols.length > 1) return [cols.length === b.cols?.length ? b : { ...b, cols }]
    return (cols[0] ?? []).map(x => ({ ...x, indent: depth(x) + depth(b) }))
  })
}

/** Index just past the last descendant of list[i]. */
export function subtreeEnd(list: Block[], i: number) {
  let j = i + 1
  while (j < list.length && depth(list[j]) > depth(list[i])) j++
  return j
}

/** Every block on the page, including the ones inside columns. */
export const allBlocks = (top: Block[]): Block[] => top.flatMap(b => (b.type === 'columns' ? [b, ...(b.cols ?? []).flat()] : [b]))

export const stripHtml = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Plain text of a block, for search and previews. */
export function blockText(b: Block) {
  if (b.type === 'table') return (b.rows ?? []).flat().map(stripHtml).join(' ')
  if (b.type === 'bookmark') return [b.meta?.title, b.url].filter(Boolean).join(' ')
  return stripHtml(b.html)
}

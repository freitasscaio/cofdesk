import type { Block, Page } from './types'

// Three-way merge at block granularity, shared by the browser and the server.
// `base` is the last version both sides agreed on; a value counts as changed when it differs from base.

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
const byId = (blocks: Block[]) => new Map(blocks.map(b => [b.id, b]))

export function mergeBlocks(base: Block[], mine: Block[], theirs: Block[]): Block[] {
  const b = byId(base), m = byId(mine)
  const out: Block[] = []
  for (const t of theirs) {
    const local = m.get(t.id)
    if (local) out.push(same(local, b.get(t.id)) ? t : local) // I edited it → keep mine
    else if (!b.has(t.id)) out.push(t) // they added it
    // else: I deleted it → stays deleted
  }
  const theirIds = new Set(theirs.map(x => x.id))
  mine.forEach((block, i) => {
    if (theirIds.has(block.id) || b.has(block.id)) return // present already, or they deleted it
    // I added it: place after its nearest preceding sibling that survived
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex(x => x.id === mine[j].id)
      if (k >= 0) { at = k + 1; break }
    }
    out.splice(at, 0, block)
  })
  return out
}

export function mergePage(base: Page | undefined, mine: Page, theirs: Page): Page {
  if (!base) return theirs.updatedAt >= mine.updatedAt ? theirs : mine
  const out: any = { ...theirs }
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    if (key === 'blocks' || key === 'props' || key === 'updatedAt') continue
    if (!same((mine as any)[key], (base as any)[key])) out[key] = (mine as any)[key]
  }
  const props = { ...theirs.props }
  for (const key of new Set([...Object.keys(mine.props), ...Object.keys(base.props)])) {
    if (!same(mine.props[key], base.props[key])) props[key] = mine.props[key]
  }
  out.props = props
  out.blocks = same(mine.blocks, base.blocks) ? theirs.blocks : mergeBlocks(base.blocks, mine.blocks, theirs.blocks)
  out.updatedAt = Math.max(Date.now(), mine.updatedAt, theirs.updatedAt)
  return out
}

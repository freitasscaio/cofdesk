import { newBlock } from './store'
import type { Block, Page } from './types'

// Turns the Markdown the AI writes into CofDesk blocks (and inline Markdown into the editor's HTML).

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function inline(md: string) {
  return escape(md)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
}

export function markdownToBlocks(md: string): Block[] {
  const out: Block[] = []
  const lines = md.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    if (raw.trim().startsWith('```')) {
      const code: string[] = []
      while (++i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i])
      out.push(newBlock('code', code.join('\n')))
      continue
    }
    const indent = Math.min(4, Math.floor((raw.match(/^ */)![0].length) / 2))
    const line = raw.trim()
    const add = (b: Block) => out.push(indent ? { ...b, indent } : b)
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) add(newBlock(`h${m[1].length}` as Block['type'], inline(m[2])))
    else if ((m = line.match(/^[-*]\s+\[( |x|X)\]\s*(.*)$/))) add({ ...newBlock('todo', inline(m[2])), checked: m[1] !== ' ' })
    else if ((m = line.match(/^[-*+]\s+(.*)$/))) add(newBlock('bullet', inline(m[1])))
    else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) add(newBlock('numbered', inline(m[1])))
    else if ((m = line.match(/^>\s?(.*)$/))) add(newBlock('quote', inline(m[1])))
    else if (/^(-{3,}|\*{3,})$/.test(line)) add(newBlock('divider'))
    else add(newBlock('text', inline(line)))
  }
  return out
}

// ---------- page → Markdown (export, and context for the AI) ----------

const strip = (h: string) => h.replace(/<br>/g, '\n').replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<i>(.*?)<\/i>/g, '_$1_')
  .replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')

export function toMarkdown(page: Page, pages: Record<string, Page>) {
  const emoji = (v?: string) => (v && !v.startsWith('lucide:') ? v + ' ' : '')
  const cell = (h: string) => strip(h).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const lines = (blocks: Block[]): string[] => {
    const nums: number[] = []
    return blocks.map(b => {
      const d = b.indent ?? 0
      nums.length = d + 1
      nums[d] = b.type === 'numbered' ? (nums[d] ?? 0) + 1 : 0
      const t = strip(b.html)
      const md = (() => {
        switch (b.type) {
          case 'h1': return `# ${t}`
          case 'h2': return `## ${t}`
          case 'h3': return `### ${t}`
          case 'bullet': return `- ${t}`
          case 'numbered': return `${nums[d]}. ${t}`
          case 'todo': return `- [${b.checked ? 'x' : ' '}] ${t}`
          case 'toggle': return b.body ? `<details><summary>${t}</summary>\n\n${strip(b.body)}\n</details>` : `- ${t}`
          case 'quote': return `> ${t}`
          case 'callout': return `> ${emoji(b.icon)}${t}`
          case 'divider': return '---'
          case 'code': return '```\n' + b.html + '\n```'
          case 'image': return b.url ? `![](${b.url.startsWith('data:') ? 'imagem-embutida' : b.url})` : ''
          case 'page': case 'database': return `[${pages[b.pageId!]?.title ?? ''}]`
          case 'columns': return (b.cols ?? []).map(c => lines(c).join('\n\n')).join('\n\n')
          case 'embed': return b.url ? `[${b.url}](${b.url})` : ''
          case 'bookmark': return b.url ? `[${b.meta?.title || b.url}](${b.url})` : ''
          case 'table': {
            const rows = b.rows ?? []
            if (!rows.length) return ''
            const head = b.header ? rows[0] : rows[0].map(() => '')
            const body = b.header ? rows.slice(1) : rows
            const row = (r: string[]) => `| ${r.map(cell).join(' | ')} |`
            return [row(head), `| ${head.map(() => '---').join(' | ')} |`, ...body.map(row)].join('\n')
          }
          default: return t
        }
      })()
      // nested blocks are indented under their parent
      return md.split('\n').map(l => '    '.repeat(d) + l).join('\n')
    })
  }
  return `# ${emoji(page.icon)}${page.title}\n\n` + lines(page.blocks).join('\n\n')
}

import Anthropic from '@anthropic-ai/sdk'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { allBlocks, blockText } from '../src/blocks.ts'
import { computedText } from '../src/dbcalc.ts'

// AI writing help and workspace Q&A, answered by Claude and streamed to the browser as plain text.

const MODEL = 'claude-opus-5-5'

let client: Anthropic | null = null
function getClient() {
  // reads ANTHROPIC_API_KEY (or an `ant auth login` profile) from the server's environment
  client ??= new Anthropic()
  return client
}

const FORMAT = `Write in Markdown using only: paragraphs, headings (#, ##, ###), "-" bullet lists, "1." numbered lists, "- [ ]" task lists, "> " quotes, fenced code blocks, **bold**, *italic* and \`inline code\`. No tables, no HTML.`

const SYSTEM = `You are the writing assistant built into CofDesk, a notes, docs and wiki app.
Answer in the language of the text you are given or of the user's request (usually Brazilian Portuguese).
Return only the content that should go into the page — no preamble such as "Here is…", no closing remarks.
${FORMAT}`

const ACTIONS: Record<string, { task: string; effort: 'low' | 'medium' }> = {
  continue: { task: 'Continue writing the page from where it stops, matching its tone and format. Write one to three paragraphs or list items.', effort: 'medium' },
  summarize: { task: 'Summarize the text in a short paragraph followed by the key points as a bullet list.', effort: 'low' },
  improve: { task: 'Rewrite the text so it reads clearly and well, keeping its meaning, language and format.', effort: 'medium' },
  fix: { task: 'Fix spelling, grammar and punctuation. Change nothing else; keep the format.', effort: 'low' },
  shorter: { task: 'Rewrite the text to be noticeably shorter while keeping the essential points.', effort: 'low' },
  longer: { task: 'Expand the text with more detail and examples, keeping its tone.', effort: 'medium' },
  simplify: { task: 'Rewrite the text in simple language that anyone can understand.', effort: 'low' },
  explain: { task: 'Explain what the text means and why it matters, briefly.', effort: 'medium' },
  actions: { task: 'Extract the action items from the text as a "- [ ]" task list. If there are none, say so in one sentence.', effort: 'low' },
  brainstorm: { task: 'Brainstorm ideas about the topic as a bullet list of 6 to 10 concise, varied ideas.', effort: 'medium' },
  translate: { task: 'Translate the text into {lang}. Keep the format.', effort: 'low' },
  custom: { task: '{prompt}', effort: 'medium' },
}

export type AiRequest = { action: string; text?: string; page?: string; prompt?: string; lang?: string }

function userMessage({ action, text, page, prompt, lang }: AiRequest) {
  const spec = ACTIONS[action] ?? ACTIONS.custom
  const task = spec.task.replace('{lang}', lang || 'English').replace('{prompt}', prompt || 'Help with this text.')
  const parts = []
  if (page) parts.push(`<page>\n${page}\n</page>`)
  if (text) parts.push(`<text>\n${text}\n</text>`)
  parts.push(`Task: ${task}${text ? ' Work on the <text>; the <page> is context.' : page ? ' Use the <page> as the text to work on.' : ''}`)
  return { content: parts.join('\n\n'), effort: spec.effort }
}

// ---------- workspace Q&A ----------
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const STOP = new Set('que para com uma como por mais dos das nos nas sobre qual quais quem onde quando the and for what which how meu minha'.split(' '))

export function pageText(p: any, pages: any[]): string {
  const lines = allBlocks(p.blocks ?? []).map(blockText).filter(Boolean)
  const parent = pages.find(x => x.id === p.parentId)
  if (parent?.kind === 'database') {
    // database rows: show their properties by name
    const byId = Object.fromEntries(pages.map(x => [x.id, x]))
    for (const prop of parent.schema ?? []) {
      let v = prop.type === 'formula' || prop.type === 'rollup' ? computedText(byId, prop, p) : p.props?.[prop.id]
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue
      if (prop.options) v = (Array.isArray(v) ? v : [v]).map((id: string) => prop.options.find((o: any) => o.id === id)?.name ?? id).join(', ')
      if (prop.type === 'relation') v = (v as string[]).map(id => pages.find(x => x.id === id)?.title ?? id).join(', ')
      lines.unshift(`${prop.name}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    }
    lines.unshift(`(linha do banco de dados "${parent.title}")`)
  }
  return lines.join('\n')
}

/** Picks the pages most related to the question, up to a size limit. */
export function workspaceContext(question: string, pages: any[], maxChars = 150_000) {
  const terms = normalize(question).split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP.has(t))
  const live = pages.filter(p => !p.trashed)
  const scored = live.map(p => {
    const title = normalize(p.title ?? '')
    const text = pageText(p, live)
    const body = normalize(text)
    const score = terms.reduce((s, t) => s + (title.includes(t) ? 5 : 0) + (body.split(t).length - 1), 0)
    return { p, text, score }
  }).sort((a, b) => b.score - a.score || b.p.updatedAt - a.p.updatedAt)
  const out: string[] = []
  let used = 0
  for (const { p, text, score } of scored) {
    if (!text.trim() && !p.title) continue
    if (score === 0 && out.length >= 20) break
    const doc = `<page id="${p.id}" title="${(p.title || 'Sem título').replace(/"/g, "'")}">\n${text}\n</page>`
    if (used + doc.length > maxChars) continue
    out.push(doc)
    used += doc.length
  }
  return out.join('\n')
}

const ASK_SYSTEM = `You answer questions about the user's CofDesk workspace (their notes, docs and databases), which is given inside <workspace>.
Base the answer only on the workspace. If it doesn't contain the answer, say so plainly and suggest where it might go.
After each statement that comes from a page, cite it as [[page:PAGE_ID]] using the page's id attribute.
Answer in the language of the question. Be direct and brief.
${FORMAT}`

// ---------- streaming ----------
function fail(res: ServerResponse, status: number, error: string) {
  if (res.headersSent) { res.end(`\n\n[Erro: ${error}]`); return }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error }))
}

function explain(e: unknown): [number, string] {
  if (e instanceof Anthropic.AuthenticationError) return [503, 'A chave da API da Anthropic é inválida. Confira ANTHROPIC_API_KEY no servidor.']
  if (e instanceof Anthropic.PermissionDeniedError) return [503, 'A chave da API não tem permissão para usar este modelo.']
  if (e instanceof Anthropic.RateLimitError) return [429, 'Muitas solicitações à IA agora. Tente de novo em instantes.']
  if (e instanceof Anthropic.APIError) return [502, `A IA respondeu com erro (${e.status ?? 'rede'}). Tente de novo.`]
  const msg = (e as Error)?.message ?? ''
  if (/api ?key|credential|auth/i.test(msg)) return [503, 'A IA não está configurada: defina ANTHROPIC_API_KEY no servidor (veja o README).']
  return [500, 'Não foi possível falar com a IA.']
}

export async function streamAi(req: IncomingMessage, res: ServerResponse, system: string, content: string, effort: 'low' | 'medium') {
  let stream: ReturnType<Anthropic['beta']['messages']['stream']>
  try {
    stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      // if a safety classifier declines, the API retries on a fallback model in the same call
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system,
      messages: [{ role: 'user', content }],
    })
  } catch (e) { const [s, m] = explain(e); return fail(res, s, m) }

  req.on('close', () => { if (!res.writableEnded) stream.abort() })
  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })
        res.write(event.delta.text)
      }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') return fail(res, 422, 'A IA não pode ajudar com este pedido.')
    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    if (final.stop_reason === 'max_tokens') res.write('\n\n[Resposta interrompida: ficou longa demais.]')
    res.end()
  } catch (e) {
    if (res.destroyed) return
    const [s, m] = explain(e)
    fail(res, s, m)
  }
}

export const aiPrompt = (r: AiRequest) => ({ system: SYSTEM, ...userMessage(r) })
export const askPrompt = (question: string, pages: any[]) => ({
  system: ASK_SYSTEM,
  content: `<workspace>\n${workspaceContext(question, pages)}\n</workspace>\n\nQuestion: ${question}`,
  effort: 'medium' as const,
})

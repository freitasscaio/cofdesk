// A small formula language in the spirit of Notion's: prop("Horas") * 2, if(prop("Feito"), "✓", "…"),
// dateBetween(prop("Prazo"), today(), "days"). Values are numbers, strings, booleans, Dates, lists or null.

export type Value = number | string | boolean | Date | Value[] | null

export class FormulaError extends Error {}

type Node =
  | { k: 'lit'; v: Value }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'cond'; c: Node; a: Node; b: Node }

type Tok = { t: 'num' | 'str' | 'id' | 'op'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = src.slice(i).match(/^\d*\.?\d+(?:e[+-]?\d+)?/i)!
      out.push({ t: 'num', v: m[0] }); i += m[0].length; continue
    }
    if (c === '"' || c === '\'' || c === '“' || c === '”') {
      const close = c === '“' ? '”' : c
      let j = i + 1, s = ''
      while (j < src.length && src[j] !== close) { s += src[j] === '\\' ? src[++j] ?? '' : src[j]; j++ }
      if (j >= src.length) throw new FormulaError('Texto sem aspas de fechamento')
      out.push({ t: 'str', v: s }); i = j + 1; continue
    }
    const id = src.slice(i).match(/^[A-Za-zÀ-ÿ_][\wÀ-ÿ]*/)
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue }
    const op = src.slice(i).match(/^(==|!=|>=|<=|&&|\|\||[-+*/%^<>=!(),?:])/)
    if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue }
    throw new FormulaError(`Caractere inesperado: ${c}`)
  }
  return out
}

const BIN: Record<string, number> = {
  '||': 1, or: 1, '&&': 2, and: 2, '==': 3, '=': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 7,
}

function parse(src: string): Node {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek() && (peek().t === 'op' || peek().t === 'id') && peek().v === v
  const expect = (v: string) => { if (!isOp(v)) throw new FormulaError(`Esperava "${v}"`); p++ }

  function primary(): Node {
    const t = toks[p++]
    if (!t) throw new FormulaError('Fórmula incompleta')
    if (t.t === 'num') return { k: 'lit', v: Number(t.v) }
    if (t.t === 'str') return { k: 'lit', v: t.v }
    if (t.t === 'op' && t.v === '(') { const e = expr(0); expect(')'); return e }
    if (t.t === 'op' && (t.v === '-' || t.v === '!' || t.v === '+')) return { k: 'un', op: t.v, a: expr(8) }
    if (t.t === 'id') {
      const name = t.v.toLowerCase()
      if (name === 'true') return { k: 'lit', v: true }
      if (name === 'false') return { k: 'lit', v: false }
      if (name === 'not' && !isOp('(')) return { k: 'un', op: '!', a: expr(8) }
      if (!isOp('(')) throw new FormulaError(`Nome desconhecido: ${t.v}`)
      p++
      const args: Node[] = []
      if (!isOp(')')) { do args.push(expr(0)); while (isOp(',') && ++p) }
      expect(')')
      return { k: 'call', name, args }
    }
    throw new FormulaError(`Símbolo inesperado: ${t.v}`)
  }

  function expr(min: number): Node {
    let left = primary()
    for (;;) {
      const t = peek()
      if (!t) break
      if (t.v === '?' && min === 0) {
        p++
        const a = expr(0); expect(':'); const b = expr(0)
        left = { k: 'cond', c: left, a, b }
        continue
      }
      const prec = (t.t === 'op' || t.t === 'id') ? BIN[t.v.toLowerCase()] : undefined
      if (prec === undefined || prec < min) break
      p++
      const right = expr(t.v === '^' ? prec : prec + 1)
      left = { k: 'bin', op: t.v.toLowerCase(), a: left, b: right }
    }
    return left
  }

  const tree = expr(0)
  if (p < toks.length) throw new FormulaError(`Símbolo inesperado: ${toks[p].v}`)
  return tree
}

const cache = new Map<string, Node>()
function compile(src: string) {
  let n = cache.get(src)
  if (!n) { n = parse(src); cache.set(src, n) }
  return n
}

// ---------- conversions ----------
const isDate = (v: Value): v is Date => v instanceof Date
export const isEmpty = (v: Value) => v == null || v === '' || (Array.isArray(v) && !v.length)
const num = (v: Value): number => {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (isDate(v)) return v.getTime()
  if (Array.isArray(v)) return v.reduce((a: number, x) => a + num(x), 0)
  const n = Number(String(v).replace(',', '.'))
  if (Number.isNaN(n)) throw new FormulaError(`"${v}" não é um número`)
  return n
}
const bool = (v: Value): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v !== '' : !!v)
const pad = (n: number) => String(n).padStart(2, '0')

export function formatValue(v: Value): string {
  if (v == null) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '∞'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (isDate(v)) {
    const d = v.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    return v.getHours() || v.getMinutes() ? `${d} ${pad(v.getHours())}:${pad(v.getMinutes())}` : d
  }
  if (Array.isArray(v)) return v.map(formatValue).filter(Boolean).join(', ')
  return v
}
const str = (v: Value) => (typeof v === 'string' ? v : formatValue(v))

const equal = (a: Value, b: Value): boolean => {
  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime()
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  if (typeof a === 'number' || typeof b === 'number') return !isEmpty(a) && !isEmpty(b) && num(a) === num(b)
  return (a ?? '') === (b ?? '')
}
const compare = (a: Value, b: Value) => {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b)
  return num(a) - num(b)
}

const UNITS: Record<string, number> = {
  years: 0, anos: 0, quarters: 0, months: 0, meses: 0, weeks: 7 * 864e5, semanas: 7 * 864e5,
  days: 864e5, dias: 864e5, hours: 36e5, horas: 36e5, minutes: 6e4, minutos: 6e4,
}
function addTo(d: Value, n: number, unit: string): Date {
  if (!isDate(d)) throw new FormulaError('Esperava uma data')
  const u = unit.toLowerCase()
  if (!(u in UNITS)) throw new FormulaError(`Unidade desconhecida: ${unit}`)
  const out = new Date(d)
  if (u === 'years' || u === 'anos') out.setFullYear(out.getFullYear() + n)
  else if (u === 'quarters') out.setMonth(out.getMonth() + n * 3)
  else if (u === 'months' || u === 'meses') out.setMonth(out.getMonth() + n)
  else return new Date(d.getTime() + n * UNITS[u])
  return out
}
function between(a: Value, b: Value, unit: string): number {
  if (!isDate(a) || !isDate(b)) return 0
  const u = unit.toLowerCase()
  if (u === 'years' || u === 'anos') return Math.trunc((num(a) - num(b)) / (365.25 * 864e5))
  if (u === 'months' || u === 'meses') return (a.getFullYear() - b.getFullYear()) * 12 + a.getMonth() - b.getMonth() - (a.getDate() < b.getDate() ? 1 : 0)
  if (!UNITS[u]) throw new FormulaError(`Unidade desconhecida: ${unit}`)
  return Math.trunc((a.getTime() - b.getTime()) / UNITS[u])
}
function formatDate(d: Value, fmt?: string) {
  if (!isDate(d)) return ''
  if (!fmt) return formatValue(d)
  return fmt.replace(/YYYY|MM|DD|HH|mm/g, t => ({
    YYYY: String(d.getFullYear()), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()),
  })[t]!)
}
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const flat = (args: Value[]): Value[] => args.flatMap(a => (Array.isArray(a) ? flat(a) : [a]))

type Fn = (args: Value[]) => Value
const FNS: Record<string, Fn> = {
  // logic
  empty: ([a]) => isEmpty(a),
  not: ([a]) => !bool(a),
  // text
  concat: args => (args.some(Array.isArray) ? flat(args) : args.map(str).join('')),
  join: ([list, sep = ', ']) => (Array.isArray(list) ? list.map(str).join(str(sep)) : str(list)),
  length: ([a]) => (Array.isArray(a) ? a.length : str(a).length),
  lower: ([a]) => str(a).toLowerCase(),
  upper: ([a]) => str(a).toUpperCase(),
  trim: ([a]) => str(a).trim(),
  contains: ([a, b]) => (Array.isArray(a) ? a.some(x => equal(x, b)) : str(a).toLowerCase().includes(str(b).toLowerCase())),
  replace: ([a, b, c]) => str(a).replace(str(b), str(c)),
  replaceall: ([a, b, c]) => str(a).split(str(b)).join(str(c)),
  slice: ([a, s, e]) => (Array.isArray(a) ? a.slice(num(s), e == null ? undefined : num(e)) : str(a).slice(num(s), e == null ? undefined : num(e))),
  format: ([a]) => str(a),
  text: ([a]) => str(a),
  tonumber: ([a]) => (isEmpty(a) ? null : num(a)),
  // math
  abs: ([a]) => Math.abs(num(a)),
  round: ([a, d = 0]) => { const f = 10 ** num(d); return Math.round(num(a) * f) / f },
  floor: ([a]) => Math.floor(num(a)),
  ceil: ([a]) => Math.ceil(num(a)),
  sqrt: ([a]) => Math.sqrt(num(a)),
  pow: ([a, b]) => num(a) ** num(b),
  mod: ([a, b]) => num(a) % num(b),
  sign: ([a]) => Math.sign(num(a)),
  ln: ([a]) => Math.log(num(a)),
  log10: ([a]) => Math.log10(num(a)),
  exp: ([a]) => Math.exp(num(a)),
  min: args => { const v = flat(args).filter(x => !isEmpty(x)).map(num); return v.length ? Math.min(...v) : null },
  max: args => { const v = flat(args).filter(x => !isEmpty(x)).map(num); return v.length ? Math.max(...v) : null },
  sum: args => flat(args).reduce((a: number, x) => a + num(x), 0),
  mean: args => { const v = flat(args).filter(x => !isEmpty(x)); return v.length ? v.reduce((a: number, x) => a + num(x), 0) / v.length : null },
  // dates
  now: () => new Date(),
  today: () => startOfToday(),
  dateadd: ([d, n, u = 'days']) => (isEmpty(d) ? null : addTo(d, num(n), str(u))),
  datesubtract: ([d, n, u = 'days']) => (isEmpty(d) ? null : addTo(d, -num(n), str(u))),
  datebetween: ([a, b, u = 'days']) => (isEmpty(a) || isEmpty(b) ? null : between(a, b, str(u))),
  formatdate: ([d, f]) => formatDate(d, f == null ? undefined : str(f)),
  year: ([d]) => (isDate(d) ? d.getFullYear() : null),
  month: ([d]) => (isDate(d) ? d.getMonth() + 1 : null),
  date: ([d]) => (isDate(d) ? d.getDate() : null),
  day: ([d]) => (isDate(d) ? d.getDay() : null),
}
FNS.media = FNS.mean
FNS.average = FNS.mean

/** Names shown in the formula editor's help. */
export const FORMULA_HELP: [string, string][] = [
  ['prop("Nome")', 'valor de uma propriedade desta linha'],
  ['if(condição, sim, não)', 'escolhe um valor; também: ifs(c1, v1, c2, v2, senão)'],
  ['+ - * / % ^', 'contas; + também junta textos'],
  ['== != > < >= <=  and or not', 'comparações e lógica'],
  ['round(x, casas) · abs · floor · ceil · sqrt · min · max · sum · mean', 'matemática'],
  ['concat · length · lower · upper · contains · replace · slice · join', 'textos e listas'],
  ['now() · today() · dateAdd(d, n, "days") · dateBetween(a, b, "days")', 'datas'],
  ['formatDate(d, "DD/MM/YYYY") · year · month · date · day', 'partes de datas'],
  ['empty(x) · toNumber(x) · format(x)', 'conversões'],
]

export interface Env { prop: (name: string) => Value }

function run(n: Node, env: Env): Value {
  switch (n.k) {
    case 'lit': return n.v
    case 'cond': return bool(run(n.c, env)) ? run(n.a, env) : run(n.b, env)
    case 'un': {
      const a = run(n.a, env)
      return n.op === '!' ? !bool(a) : n.op === '-' ? -num(a) : num(a)
    }
    case 'bin': {
      if (n.op === '&&' || n.op === 'and') return bool(run(n.a, env)) && bool(run(n.b, env))
      if (n.op === '||' || n.op === 'or') return bool(run(n.a, env)) || bool(run(n.b, env))
      const a = run(n.a, env), b = run(n.b, env)
      switch (n.op) {
        case '+':
          if (typeof a === 'string' || typeof b === 'string') return str(a) + str(b)
          if (isDate(a) && typeof b === 'number') return addTo(a, b, 'days')
          return num(a) + num(b)
        case '-':
          if (isDate(a) && isDate(b)) return between(a, b, 'days')
          if (isDate(a) && typeof b === 'number') return addTo(a, -b, 'days')
          return num(a) - num(b)
        case '*': return num(a) * num(b)
        case '/': { const d = num(b); if (d === 0) throw new FormulaError('Divisão por zero'); return num(a) / d }
        case '%': return num(a) % num(b)
        case '^': return num(a) ** num(b)
        case '==': case '=': return equal(a, b)
        case '!=': return !equal(a, b)
        case '<': return compare(a, b) < 0
        case '>': return compare(a, b) > 0
        case '<=': return compare(a, b) <= 0
        case '>=': return compare(a, b) >= 0
      }
      throw new FormulaError(`Operador desconhecido: ${n.op}`)
    }
    case 'call': {
      if (n.name === 'prop') {
        if (n.args.length !== 1) throw new FormulaError('prop() recebe o nome de uma propriedade')
        return env.prop(str(run(n.args[0], env)))
      }
      if (n.name === 'if') {
        if (n.args.length < 2) throw new FormulaError('if() precisa de condição e valor')
        return bool(run(n.args[0], env)) ? run(n.args[1], env) : n.args[2] ? run(n.args[2], env) : null
      }
      if (n.name === 'ifs') {
        for (let i = 0; i + 1 < n.args.length; i += 2) if (bool(run(n.args[i], env))) return run(n.args[i + 1], env)
        return n.args.length % 2 ? run(n.args[n.args.length - 1], env) : null
      }
      const fn = FNS[n.name]
      if (!fn) throw new FormulaError(`Função desconhecida: ${n.name}()`)
      return fn(n.args.map(a => run(a, env)))
    }
  }
}

export function evaluate(src: string, env: Env): Value {
  if (!src.trim()) return null
  const v = run(compile(src), env)
  return typeof v === 'number' && Number.isNaN(v) ? null : v
}

/** Checks a formula without running it; returns an error message or null. */
export function checkFormula(src: string): string | null {
  try { if (src.trim()) compile(src); return null } catch (e) { return (e as Error).message }
}

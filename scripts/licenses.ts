// Lists the open-source packages CofDesk ships (production dependencies and everything they pull in)
// with their license texts, as most of those licenses require. Written to public/licenses.json,
// which the /licencas page shows. Runs before every build (npm run build) or with: npm run licenses
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const seen = new Map<string, { name: string; version: string; license: string; repository?: string; text?: string }>()

for (const [path, info] of Object.entries<any>(lock.packages)) {
  if (!path || info.dev || info.link) continue
  const dir = path
  const pkgFile = join(dir, 'package.json')
  if (!existsSync(pkgFile)) continue
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  const key = `${pkg.name}@${pkg.version}`
  if (seen.has(key)) continue
  const licenseFile = readdirSync(dir).find(f => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f))
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  seen.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'desconhecida',
    repository: repo?.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/'),
    text: licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : undefined,
  })
}

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
writeFileSync('public/licenses.json', JSON.stringify(list))
const missing = list.filter(p => !p.text).map(p => p.name)
console.log(`licenses.json: ${list.length} pacotes${missing.length ? ` (sem arquivo de licença: ${missing.join(', ')})` : ''}`)

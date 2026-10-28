import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// Encrypts tokens and passwords of connected accounts before they go into the database.
// The key comes from COFDESK_SECRET; without it (development) a random key is kept next to the database.

function loadKey() {
  if (process.env.COFDESK_SECRET) return createHash('sha256').update(process.env.COFDESK_SECRET).digest()
  if (process.env.NODE_ENV === 'production') throw new Error('Defina COFDESK_SECRET em produção (veja o README).')
  const file = join(dirname(resolve(process.env.COFDESK_DB ?? 'data/cofdesk.db')), 'secret.key')
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 })
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
}
const key = loadKey()

export function seal(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function unseal<T = any>(sealed: string): T {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'))
}

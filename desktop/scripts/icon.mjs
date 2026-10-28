// Draws the CofDesk app icon (the "C" mark on a dark rounded square) as a 1024×1024 PNG, so it needs no
// image tools. electron-builder turns build/icon.png into the Windows, macOS and Linux icon formats.
// Run: node scripts/icon.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 1024
const SS = 4 // samples per axis, for smooth edges
const bg = [31, 31, 31]
const fg = [255, 255, 255]

const corner = S * 0.225
const inset = S * 0.04
const cx = S / 2, cy = S / 2
const radius = S * 0.235
const stroke = S * 0.105
const gap = (48 * Math.PI) / 180 // half-opening of the C, facing right
const ends = [-gap, gap].map(a => [cx + radius * Math.cos(a), cy + radius * Math.sin(a)])

function inSquare(x, y) {
  const lo = inset, hi = S - inset
  if (x < lo || x > hi || y < lo || y > hi) return false
  const dx = Math.max(lo + corner - x, 0, x - (hi - corner))
  const dy = Math.max(lo + corner - y, 0, y - (hi - corner))
  return dx * dx + dy * dy <= corner * corner
}
function inC(x, y) {
  const d = Math.hypot(x - cx, y - cy)
  const a = Math.atan2(y - cy, x - cx)
  if (Math.abs(d - radius) <= stroke / 2 && Math.abs(a) >= gap) return true
  return ends.some(([ex, ey]) => Math.hypot(x - ex, y - ey) <= stroke / 2) // round caps
}

const rows = []
for (let y = 0; y < S; y++) {
  const row = Buffer.alloc(1 + S * 4) // filter byte + RGBA
  for (let x = 0; x < S; x++) {
    let cover = 0, mark = 0
    for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) {
      const px = x + (i + 0.5) / SS, py = y + (j + 0.5) / SS
      if (inSquare(px, py)) { cover++; if (inC(px, py)) mark++ }
    }
    const n = SS * SS
    const t = cover ? mark / cover : 0
    const o = 1 + x * 4
    for (let k = 0; k < 3; k++) row[o + k] = Math.round(bg[k] + (fg[k] - bg[k]) * t)
    row[o + 3] = Math.round((cover / n) * 255)
  }
  rows.push(row)
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(S, 0); header.writeUInt32BE(S, 4)
header[8] = 8; header[9] = 6 // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(new URL('../build/icon.png', import.meta.url), png)
console.log(`build/icon.png: ${S}×${S}, ${(png.length / 1024).toFixed(0)} KB`)

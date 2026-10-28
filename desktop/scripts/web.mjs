// Builds the front end into app/web for the desktop app. The app talks to the CofDesk server over the
// internet, so its address must be known at build time:
//   VITE_API_URL  the server, e.g. https://api.cofdesk.com.br (required)
//   VITE_WEB_URL  the website, for links people share (optional; defaults to VITE_API_URL)
import { execSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const api = process.env.VITE_API_URL
if (!api || !/^https?:\/\//.test(api)) {
  console.error('Defina VITE_API_URL com o endereço do servidor do CofDesk (ex.: https://api.cofdesk.com.br).')
  process.exit(1)
}
const root = fileURLToPath(new URL('../..', import.meta.url))
const run = cmd => execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env })
run('node scripts/licenses.ts')
run('npx vite build --outDir desktop/app/web --emptyOutDir')
copyFileSync(new URL('../build/icon.png', import.meta.url), new URL('../app/icon.png', import.meta.url))
console.log(`Front end do app pronto, usando o servidor ${api}`)

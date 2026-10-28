import { useState } from 'react'
import { ICON_COLORS, IconView, PAGE_ICONS, lucideIcon } from './icons'

const EMOJIS = '📄 📝 📌 📚 📊 📈 🗂 🗃 ✅ 🎯 🚀 💡 🔥 ⭐ ❤️ 🧠 💼 🏠 🎨 🎬 🎵 📷 🛠 ⚙️ 🧪 📅 ⏰ 💰 🛒 ✈️ 🌱 🍕 ☕ 🐶 😀 👋 🎉 🏆 📣 🔒'.split(' ')

export function IconPicker({ onPick }: { onPick: (icon: string) => void }) {
  const [tab, setTab] = useState<'icons' | 'emoji'>('icons')
  const [color, setColor] = useState('gray')
  const [q, setQ] = useState('')
  const names = Object.keys(PAGE_ICONS).filter(n => n.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="icon-picker">
      <div className="picker-tabs">
        <button className={tab === 'icons' ? 'on' : ''} onClick={() => setTab('icons')}>Ícones</button>
        <button className={tab === 'emoji' ? 'on' : ''} onClick={() => setTab('emoji')}>Emoji</button>
        <button className="picker-remove" onClick={() => onPick('')}>Remover</button>
      </div>
      {tab === 'icons' ? (
        <>
          <div className="picker-bar">
            <input className="input sm" placeholder="Filtrar…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
            <div className="color-dots">
              {Object.entries(ICON_COLORS).map(([name, hex]) => (
                <button key={name} title={name} className={color === name ? 'on' : ''} style={{ background: hex }} onClick={() => setColor(name)} />
              ))}
            </div>
          </div>
          <div className="icon-grid">
            {names.map(n => (
              <button key={n} title={n} onClick={() => onPick(lucideIcon(n, color))}><IconView value={lucideIcon(n, color)} size={20} /></button>
            ))}
          </div>
        </>
      ) : (
        <div className="emoji-grid">{EMOJIS.map(e => <button key={e} onClick={() => onPick(e)}>{e}</button>)}</div>
      )}
    </div>
  )
}

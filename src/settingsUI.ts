import { create } from 'zustand'

export type SettingsSection = 'perfil' | 'preferencias' | 'agendas' | 'privacidade' | 'geral' | 'pessoas' | 'dados' | 'publicas' | 'sobre'

/** Which settings section is open (null: the settings dialog is closed). */
export const useSettingsUI = create<{ section: SettingsSection | null; open: (section?: SettingsSection) => void; close: () => void }>(set => ({
  section: null,
  open: (section = 'perfil') => set({ section }),
  close: () => set({ section: null }),
}))

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * CofDesk itself sets no cookies and runs no analytics or advertising: what it keeps in the browser is
 * needed for the service (session, offline copy, preferences). The only optional category is content
 * from other sites embedded in pages (videos, maps, documents), which can set their own cookies.
 * It loads only with consent, given here or one embed at a time.
 */
interface ConsentState {
  /** null until the visitor chooses */
  embeds: boolean | null
  decidedAt: string | null
  /** the preferences dialog, reopened from the footer links */
  open: boolean
  choose: (embeds: boolean) => void
  setOpen: (open: boolean) => void
}

export const useConsent = create<ConsentState>()(
  persist(
    set => ({
      embeds: null,
      decidedAt: null,
      open: false,
      choose: embeds => set({ embeds, decidedAt: new Date().toISOString(), open: false }),
      setOpen: open => set({ open }),
    }),
    { name: 'cofdesk-consent', version: 1, partialize: s => ({ embeds: s.embeds, decidedAt: s.decidedAt }) },
  ),
)

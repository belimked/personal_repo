import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { BRIEF_ITEMS, FACTS, type Fact, type ItemState } from './data'

interface Store {
  states: Record<string, ItemState>
  replies: Record<string, string>
  facts: Fact[]
  generalMode: boolean
  setState: (id: string, s: ItemState) => void
  setReply: (id: string, text: string) => void
  removeFact: (id: string) => void
  setGeneralMode: (v: boolean) => void
  reset: () => void
}

const Ctx = createContext<Store | null>(null)
const initStates = () => Object.fromEntries(BRIEF_ITEMS.map((i) => [i.id, 'pending' as ItemState]))

export function StoreProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, ItemState>>(initStates)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [facts, setFacts] = useState<Fact[]>(FACTS)
  const [generalMode, setGeneralMode] = useState(false)
  const value = useMemo<Store>(() => ({
    states, replies, facts, generalMode, setGeneralMode,
    setState: (id, s) => setStates((p) => ({ ...p, [id]: s })),
    setReply: (id, text) => setReplies((p) => ({ ...p, [id]: text })),
    removeFact: (id) => setFacts((p) => p.filter((f) => f.id !== id)),
    reset: () => { setStates(initStates()); setReplies({}); setFacts(FACTS); setGeneralMode(false) },
  }), [states, replies, facts, generalMode])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

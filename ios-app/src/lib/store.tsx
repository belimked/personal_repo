import * as Crypto from 'expo-crypto'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as Notifications from 'expo-notifications'
import { AppState } from 'react-native'
import { api, ApiError, tokenStorage, type ApiItem, type Kind, type User } from './api'
import { BRIEF_ITEMS, FACTS, WATCHING, type Fact, type ItemState } from './data'
import { registerPush, unregisterPush } from './push'

interface Store {
  states: Record<string, ItemState>
  replies: Record<string, string>
  facts: Fact[]
  watching: { id?: string; title: string; note: string }[]
  items: ApiItem[]
  generalMode: boolean
  token: string | null
  user: User | null
  ready: boolean
  demo: boolean
  refreshing: boolean
  refresh: (silent?: boolean) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  enterDemo: () => void
  logout: () => Promise<void>
  addItem: (kind: 'todo' | 'idea' | 'watch', title: string) => void
  setDone: (id: string, done: boolean) => void
  /** 改类型或补字段，例如把“想做的事”安排成待办 */
  moveItem: (id: string, kind: 'todo' | 'idea' | 'watch', patch?: Record<string, unknown>) => void
  deleteItem: (id: string) => void
  setState: (id: string, s: ItemState) => void
  setReply: (id: string, text: string) => void
  removeFact: (id: string) => void
  setGeneralMode: (v: boolean) => void
  /** 用户偏好，存成 setting 事项，多端同步 */
  setSetting: (key: string, value: unknown) => void
  reset: () => void
}

const Ctx = createContext<Store | null>(null)
const initStates = () => Object.fromEntries(BRIEF_ITEMS.map((i) => [i.id, 'pending' as ItemState]))
type Pending = { id: string; kind: Kind; data?: Record<string, unknown>; remove?: boolean }
const kinds: Kind[] = ['todo', 'idea', 'stash', 'watch', 'file', 'fact', 'setting']
const textOf = (data: Record<string, unknown>) => typeof data.title === 'string' ? data.title : typeof data.text === 'string' ? data.text : ''

export function StoreProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, ItemState>>(initStates)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [facts, setFacts] = useState<Fact[]>(FACTS)
  const [watching, setWatching] = useState<Store['watching']>(WATCHING)
  const [items, setItems] = useState<ApiItem[]>([])
  const itemsRef = useRef<ApiItem[]>([])
  const [generalMode, setGeneralModeLocal] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [demo, setDemo] = useState(false)
  const [ready, setReady] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const pending = useRef<Map<string, Pending>>(new Map())
  const busy = useRef<Set<string>>(new Set())
  const tokenRef = useRef<string | null>(null)
  const seeding = useRef(false)

  const publish = useCallback((list: ApiItem[]) => {
    itemsRef.current = list
    setItems(list)
    setWatching(list.filter((i) => i.kind === 'watch' && !i.deleted).map((i) => ({ id: i.id, title: textOf(i.data), note: typeof i.data.note === 'string' ? i.data.note : '' })))
    setFacts(list.filter((i) => i.kind === 'fact' && !i.deleted && typeof i.data.text === 'string').map((i) => ({
      id: i.id, text: i.data.text as string,
      group: i.data.group === '健康' ? '健康' : '工作', from: typeof i.data.from === 'string' ? i.data.from : '来自：你告诉小禾的事',
    })))
    const setting = list.find((i) => i.kind === 'setting' && i.id === 'setting-generalMode' && !i.deleted)
    setGeneralModeLocal(setting?.data.value === true)
    setStates((prev) => {
      const next = { ...prev }
      for (const i of list) {
        if (i.kind === 'todo' && !i.deleted && i.id in next) {
          if (i.data.state === 'pending' || i.data.state === 'done' || i.data.state === 'later') next[i.id] = i.data.state
          else next[i.id] = i.data.done === true ? 'done' : 'pending'
        }
        if (i.kind === 'stash' && !i.deleted && typeof i.data.briefId === 'string' && i.data.briefId in next) next[i.data.briefId] = 'later'
      }
      return next
    })
    setReplies((prev) => {
      const next = { ...prev }
      for (const i of list) if (i.kind === 'todo' && !i.deleted && typeof i.data.reply === 'string') next[i.id] = i.data.reply
      return next
    })
  }, [])

  const flush = useCallback(async (id: string, auth: string) => {
    if (busy.current.has(id)) return
    busy.current.add(id)
    try {
      while (tokenRef.current === auth) {
        const entry = pending.current.get(id)
        if (!entry) break
        try {
          if (entry.remove) await api.deleteItem(auth, id)
          else await api.putItem(auth, id, entry.kind, entry.data ?? {})
          if (pending.current.get(id) === entry) pending.current.delete(id)
        } catch { break /* 保留乐观操作，下次同步重试 */ }
      }
    } finally { busy.current.delete(id) }
  }, [])
  const queue = useCallback((entry: Pending) => {
    pending.current.set(entry.id, entry)
    if (tokenRef.current) void flush(entry.id, tokenRef.current)
  }, [flush])
  const upsert = useCallback((id: string, kind: Kind, data: Record<string, unknown>) => {
    const old = itemsRef.current.find((i) => i.id === id)
    publish([...(itemsRef.current.filter((i) => i.id !== id)), {
      id, kind, data: { ...old?.data, ...data }, created_at: old?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), deleted: 0,
    }])
    queue({ id, kind, data: { ...old?.data, ...data } })
  }, [publish, queue])
  // silent：后台自动刷新，不显示下拉刷新的转圈
  const sync = useCallback(async (auth: string, silent = false) => {
    if (tokenRef.current !== auth) return
    if (!silent) setRefreshing(true)
    try {
      await Promise.all([...pending.current.keys()].map((id) => flush(id, auth)))
      let remote: ApiItem[]
      try { remote = (await api.items(auth)).items }
      catch (e) {
        if (!(e instanceof ApiError && e.status === 400)) throw e
        remote = (await Promise.all(kinds.map((kind) => api.items(auth, kind)))).flatMap((r) => r.items)
      }
      if (tokenRef.current !== auth) return
      // 只在服务端从未有过 fact（包括已删除项）时播种，避免删光后重新出现。
      const seed = !remote.some((i) => i.kind === 'fact') && !seeding.current
      if (seed) seeding.current = true
      const byId = new Map(remote.map((i) => [i.id, i]))
      if (seed) for (const f of FACTS) {
        const id = `fact-${f.id}`
        const data = { text: f.text, group: f.group, from: f.from }
        byId.set(id, { id, kind: 'fact', data, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted: 0 })
        queue({ id, kind: 'fact', data })
      }
      for (const [id, entry] of pending.current) {
        const old = itemsRef.current.find((i) => i.id === id)
        if (entry.remove) {
          if (byId.has(id)) byId.set(id, { ...byId.get(id)!, deleted: 1 })
        } else byId.set(id, { id, kind: entry.kind, data: entry.data ?? {}, created_at: old?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), deleted: 0 })
      }
      publish([...byId.values()])
    } catch { /* 离线保持当前内容，保留 pending */ }
    finally { if (tokenRef.current === auth) setRefreshing(false) }
  }, [flush, publish, queue])
  const refresh = useCallback(async (silent = false) => { if (tokenRef.current) await sync(tokenRef.current, silent) }, [sync])

  useEffect(() => {
    let mounted = true
    tokenStorage.get().then(async (saved) => {
      if (!saved || !mounted) return
      try {
        const result = await api.me(saved)
        if (!mounted) return
        setUser(result.user); setToken(saved); tokenRef.current = saved
        void sync(saved)
        void registerPush(saved)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await tokenStorage.clear()
        else if (mounted) { setToken(saved); tokenRef.current = saved; void sync(saved) }
      }
    }).catch(() => {}).finally(() => { if (mounted) setReady(true) })
    return () => { mounted = false }
  }, [sync])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active' && tokenRef.current) void sync(tokenRef.current, true) })
    // 收到推送（纪要、资料、语音回复整理好了）说明事项有变化，马上同步一次
    const push = Notifications.addNotificationReceivedListener(() => { if (tokenRef.current) void sync(tokenRef.current, true) })
    return () => { sub.remove(); push.remove() }
  }, [sync])

  const reset = useCallback(() => {
    setStates(initStates()); setReplies({}); setFacts(FACTS); setWatching(WATCHING); setGeneralModeLocal(false)
    itemsRef.current = []; setItems([]); pending.current.clear(); seeding.current = false; setRefreshing(false)
  }, [])
  const value = useMemo<Store>(() => ({
    states, replies, facts, watching, items, generalMode, token, user, ready, demo, refreshing, refresh,
    login: async (email, password) => {
      const result = await api.login(email.trim(), password)
      await tokenStorage.set(result.token)
      reset(); setDemo(false); setUser(result.user); setToken(result.token); tokenRef.current = result.token
      void sync(result.token)
      void registerPush(result.token)
    },
    enterDemo: () => { tokenRef.current = null; reset(); setDemo(true); setToken(null); setUser(null) },
    logout: async () => {
      const old = tokenRef.current
      tokenRef.current = null; setToken(null); setUser(null); setDemo(false); reset()
      await tokenStorage.clear().catch(() => {})
      if (old) void unregisterPush(old).finally(() => api.logout(old).catch(() => {}))
    },
    addItem: (kind, title) => { if (tokenRef.current && title.trim()) upsert(Crypto.randomUUID(), kind, { title: title.trim(), ...(kind === 'todo' ? { done: false } : kind === 'watch' ? { note: '' } : {}) }) },
    setDone: (id, done) => {
      const item = itemsRef.current.find((i) => i.id === id)
      if (tokenRef.current && item) upsert(id, item.kind, { done, done_at: done ? new Date().toISOString() : null })
    },
    moveItem: (id, kind, patch = {}) => {
      const item = itemsRef.current.find((i) => i.id === id)
      if (tokenRef.current && item) upsert(id, kind, patch)
    },
    deleteItem: (id) => {
      const item = itemsRef.current.find((i) => i.id === id)
      if (!tokenRef.current || !item) return
      publish(itemsRef.current.map((i) => i.id === id ? { ...i, deleted: 1 } : i))
      if (item.kind === 'stash' && typeof item.data.briefId === 'string') {
        const briefId = item.data.briefId
        setStates((p) => ({ ...p, [briefId]: 'pending' }))
        const brief = itemsRef.current.find((i) => i.id === briefId && i.kind === 'todo')
        if (brief) upsert(briefId, 'todo', { state: 'pending', done: false })
      }
      queue({ id, kind: item.kind, remove: true })
    },
    setState: (id, s) => {
      setStates((p) => ({ ...p, [id]: s }))
      if (tokenRef.current) {
        upsert(id, 'todo', { title: BRIEF_ITEMS.find((i) => i.id === id)?.title ?? id, state: s, done: s === 'done', reply: replies[id] ?? BRIEF_ITEMS.find((i) => i.id === id)?.reply })
        if (s === 'later') upsert(`stash-${id}`, 'stash', { title: BRIEF_ITEMS.find((i) => i.id === id)?.title ?? id, briefId: id, state: s })
      }
    },
    setReply: (id, text) => {
      setReplies((p) => ({ ...p, [id]: text }))
      if (tokenRef.current) upsert(id, 'todo', { title: BRIEF_ITEMS.find((i) => i.id === id)?.title ?? id, state: states[id] ?? 'pending', reply: text })
    },
    removeFact: (id) => {
      if (tokenRef.current) {
        const item = itemsRef.current.find((i) => i.id === id)
        if (item) { publish(itemsRef.current.map((i) => i.id === id ? { ...i, deleted: 1 } : i)); queue({ id, kind: 'fact', remove: true }) }
      } else setFacts((p) => p.filter((f) => f.id !== id))
    },
    setGeneralMode: (v) => {
      setGeneralModeLocal(v)
      if (tokenRef.current) upsert('setting-generalMode', 'setting', { key: 'generalMode', value: v })
    },
    setSetting: (key, value) => { if (tokenRef.current) upsert(`setting-${key}`, 'setting', { key, value }) },
    reset,
  }), [states, replies, facts, watching, items, generalMode, token, user, ready, demo, refreshing, refresh, reset, sync, upsert, publish, queue])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

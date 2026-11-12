import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NavBar } from '@/components/NavBar'
import { Icon } from '@/components/ui'
import { toast } from '@/components/Toast'
import { api, type Message } from '@/lib/api'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

const PAGE = 30
const day = (iso: string) => new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })
const label = (m: Message) => m.item_kind === 'watch' ? '已交给小禾' : m.item_kind === 'idea' ? '已记成想法' : '已转成待办'

export default function Chats() {
  const { token, refresh } = useStore()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const [list, setList] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [first, setFirst] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null)
  const keepTop = useRef<number | null>(null)
  const height = useRef(0)
  const longPressed = useRef(false)
  useEffect(() => { const t = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(t) }, [query])
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      if (!live) return
      setFirst(true); setList([]); setMore(false)
      if (!token) { setFirst(false); return }
      api.messages(token, PAGE, undefined, search).then((r) => { if (live) { setList(r.messages); setMore(r.has_more) } })
        .catch(() => { /* 网络不好时显示空 */ }).finally(() => { if (live) setFirst(false) })
    }, 0)
    return () => { live = false; clearTimeout(t) }
  }, [token, search])
  const older = async () => {
    if (!token || busy || !list.length) return
    setBusy(true); keepTop.current = height.current
    try {
      const r = await api.messages(token, PAGE, list[0].created_at, search)
      setList((p) => [...r.messages.filter((m) => !p.some((x) => x.id === m.id)), ...p])
      setMore(r.has_more)
    } catch { keepTop.current = null } finally { setBusy(false) }
  }
  const toggle = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length >= 50 ? (toast('最多选择 50 条'), p) : [...p, id])
  const exit = () => { setSelecting(false); setSelected([]) }
  const convert = () => ActionSheetIOS.showActionSheetWithOptions({ options: ['工作待办', '生活待办', '交给小禾盯着', '记成想法', '取消'], cancelButtonIndex: 4 }, (index) => {
    if (index === 4 || !token || busy || !selected.length) return
    const kind = index === 2 ? 'watch' : index === 3 ? 'idea' : 'todo'
    const scene = index === 1 ? 'life' : 'work'
    setBusy(true)
    void api.convertMessages(token, selected.slice(0, 50), kind, scene).then(async ({ item }) => {
      setList((p) => p.map((m) => selected.includes(m.id) ? { ...m, item_id: item.id, item_kind: item.kind } : m))
      exit(); toast(`${kind === 'watch' ? '已交给小禾盯着' : kind === 'idea' ? '已记成想法' : '已转成待办'}：${String(item.data.title ?? '')}`)
      await refresh(true)
    }).catch((e) => toast(e instanceof Error ? e.message : '转换失败，请重试')).finally(() => setBusy(false))
  })
  const highlighted = (content: string) => {
    if (!search) return content
    const parts: React.ReactNode[] = []
    let at = 0, pos = content.toLowerCase().indexOf(search.toLowerCase())
    while (pos >= 0) {
      parts.push(content.slice(at, pos), <Text key={pos} style={s.hit}>{content.slice(pos, pos + search.length)}</Text>)
      at = pos + search.length; pos = content.toLowerCase().indexOf(search.toLowerCase(), at)
    }
    parts.push(content.slice(at))
    return parts
  }
  return <SafeAreaView edges={['top']} style={{ flex: 1 }}>
    <NavBar back={from === 'home' ? '管家' : '我的'} fallback={from === 'home' ? '/' : '/me'} title="聊天记录" right={<Pressable onPress={() => selecting ? exit() : setSelecting(true)} style={s.select}><Text style={s.action}>{selecting ? '完成' : '选择'}</Text></Pressable>} />
    <View style={s.search}><Icon name="magnifyingglass" size={18} color={c.t3} /><TextInput style={s.input} placeholder="搜聊天记录" placeholderTextColor={c.t3} value={query} onChangeText={setQuery} clearButtonMode="while-editing" returnKeyType="search" /></View>
    <ScrollView ref={scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" onContentSizeChange={(_, h) => { if (keepTop.current !== null) { scroll.current?.scrollTo({ y: Math.max(0, h - keepTop.current), animated: false }); keepTop.current = null } height.current = h }}>
      {first ? <ActivityIndicator style={{ marginTop: 40 }} /> : null}
      {!first && !list.length ? <Text style={s.empty}>{search ? '没有找到聊天记录' : '还没有聊天记录'}</Text> : null}
      {more ? <Pressable disabled={busy} onPress={() => { void older() }} style={s.older}><Text style={s.action}>{busy ? '加载中…' : '加载更早的'}</Text></Pressable> : null}
      {list.map((m, i) => <View key={m.id}>
        {i === 0 || day(list[i - 1].created_at) !== day(m.created_at) ? <Text style={s.day}>{day(m.created_at)}</Text> : null}
        <Pressable onLongPress={() => { longPressed.current = true; setSelecting(true); setSelected((p) => p.includes(m.id) ? p : p.length >= 50 ? p : [...p, m.id]) }} onPress={() => { if (longPressed.current) { longPressed.current = false; return } if (selecting) toggle(m.id) }} style={s.message}>
          {selecting ? <View style={[s.check, selected.includes(m.id) && s.checked]}>{selected.includes(m.id) ? <Icon name="checkmark" size={14} color="#fff" /> : null}</View> : null}
          <View style={{ flex: 1 }}><View style={[s.bubble, m.role === 'user' ? s.mine : s.assistant]}><Text style={s.text} selectable={!selecting}>{highlighted(m.content)}</Text></View>{m.item_id ? <Text style={[s.tag, m.role === 'user' && { textAlign: 'right' }]}>{label(m)}</Text> : null}</View>
        </Pressable>
      </View>)}
    </ScrollView>
    {selecting ? <View style={s.bar}><Text style={s.count}>已选 {selected.length} 条</Text><Pressable disabled={!selected.length || busy} onPress={convert} style={[s.button, (!selected.length || busy) && { opacity: 0.4 }]}><Text style={s.buttonText}>转成…</Text></Pressable></View> : null}
  </SafeAreaView>
}
const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center' }, select: { paddingHorizontal: 16, paddingVertical: 12 }, action: { color: c.accInk, fontSize: 15 },
  search: { marginHorizontal: 16, marginVertical: 8, backgroundColor: c.card, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }, input: { flex: 1, fontSize: 15, color: c.t1, paddingVertical: 9 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 }, empty: { color: c.t3, fontSize: 15, textAlign: 'center', marginTop: 40 }, older: { alignSelf: 'center', padding: 10 },
  day: { color: c.t3, fontSize: 13, textAlign: 'center', marginTop: 16, marginBottom: 4 }, message: { flexDirection: 'row', alignItems: 'center', gap: 10 }, check: { height: 22, width: 22, borderRadius: 11, borderWidth: 1, borderColor: c.t3, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: c.acc, borderColor: c.acc },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }, mine: { alignSelf: 'flex-end', backgroundColor: c.accTint }, assistant: { alignSelf: 'flex-start', backgroundColor: c.card }, text: { fontSize: 15, lineHeight: 22, color: c.t1 }, hit: { color: c.accInk, fontWeight: '700' }, tag: { color: c.t3, fontSize: 12, marginTop: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, count: { color: c.t2, fontSize: 15 }, button: { backgroundColor: c.acc, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10 }, buttonText: { color: '#fff', fontSize: 15 },
})

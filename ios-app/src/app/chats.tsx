import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NavBar } from '@/components/NavBar'
import { api, askWithFallback, streamChat, type Message } from '@/lib/api'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

const PAGE = 30
const day = (iso: string) => new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })
type Bubble = Pick<Message, 'role' | 'content'> & { id: string; created_at: string; search?: string }

/** 对话页（我的 › 聊天记录；首页点“说一句”也到这里）：全部对话按天分组，底部打字，回复流式显示 */
export default function Chats() {
  const { token, refresh } = useStore()
  const { from, type } = useLocalSearchParams<{ from?: string; type?: string }>()
  const [list, setList] = useState<Bubble[]>([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [first, setFirst] = useState(true)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null)
  const input = useRef<React.ElementRef<typeof TextInput>>(null)
  const keepTop = useRef<number | null>(null)
  const height = useRef(0)
  const toEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100)

  useEffect(() => {
    if (!token) return
    let live = true
    api.messages(token, PAGE).then((r) => { if (live) { setList(r.messages); setMore(r.has_more); toEnd() } })
      .catch(() => { /* 网络不好时显示空 */ }).finally(() => { if (live) setFirst(false) })
    if (type === '1') setTimeout(() => input.current?.focus(), 400)
    return () => { live = false }
  }, [token, type])

  const older = async () => {
    if (!token || busy || !list.length) return
    setBusy(true); keepTop.current = height.current
    try {
      const r = await api.messages(token, PAGE, list[0].created_at)
      setList((p) => [...r.messages.filter((m) => !p.some((x) => x.id === m.id)), ...p])
      setMore(r.has_more)
    } catch { keepTop.current = null } finally { setBusy(false) }
  }

  const put = (content: string, search?: string) => setList((p) => { const n = [...p]; n[n.length - 1] = { ...n[n.length - 1], content, search }; return n })
  const send = async () => {
    const message = draft.trim()
    if (!message || thinking || !token) return
    const now = new Date().toISOString()
    setDraft(''); setThinking(true)
    setList((p) => [...p, { id: `u${now}`, role: 'user', content: message, created_at: now }, { id: `a${now}`, role: 'assistant', content: '', created_at: now }])
    toEnd()
    if (/^(帮我)?[搜查找]/.test(message)) {
      try {
        const r = await askWithFallback(token, message)
        put([r.answer || '找到这些结果：', ...r.things.slice(0, 5).map((t) => `· ${t.title}${t.due ? `（${t.due}）` : ''}`)].join('\n'), message)
      } catch { put('现在搜不了，稍后再试。') }
    } else {
      let text = ''
      try {
        const reply = await streamChat(token, message, (delta) => { text += delta; put(text); toEnd() })
        put(reply)
      } catch {
        try { put((await api.chat(token, message)).reply) }
        catch { put(text ? `${text}\n连接中断，请重试。` : '现在连不上，这句没发出去。稍后再试一次。') }
      }
    }
    setThinking(false); toEnd()
    void refresh(true) // 首页的最近 3 条跟着更新
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <NavBar back={from === 'home' ? '管家' : '我的'} fallback={from === 'home' ? '/' : '/me'} title="聊天记录" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView ref={scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          onContentSizeChange={(_, h) => { if (keepTop.current !== null) { scroll.current?.scrollTo({ y: Math.max(0, h - keepTop.current), animated: false }); keepTop.current = null } height.current = h }}>
          {first ? <ActivityIndicator style={{ marginTop: 40 }} /> : null}
          {!first && !list.length ? <Text style={s.empty}>还没有聊天记录，有事直接说</Text> : null}
          {more ? <Pressable disabled={busy} onPress={() => { void older() }} style={s.older}>
            <Text style={s.olderText}>{busy ? '加载中…' : '加载更早的'}</Text>
          </Pressable> : null}
          {list.map((m, i) => (
            <View key={m.id}>
              {i === 0 || day(list[i - 1].created_at) !== day(m.created_at) ? <Text style={s.day}>{day(m.created_at)}</Text> : null}
              {m.content || m.role === 'user' ? <View style={[s.bubble, m.role === 'user' ? s.mine : s.assistant]}>
                <Text style={s.text} selectable>{m.content}</Text>
                {m.search ? <Pressable onPress={() => router.push({ pathname: '/search', params: { q: m.search } })}><Text style={s.link}>看全部结果</Text></Pressable> : null}
              </View> : <Text style={s.thinking}>小禾正在想…</Text>}
            </View>
          ))}
        </ScrollView>
        <View style={s.bar}>
          <View style={s.compose}>
            <TextInput ref={input} style={s.input} value={draft} onChangeText={setDraft} placeholder="有什么事交给我？" placeholderTextColor={c.t3} multiline
              editable={!!token} onFocus={toEnd} />
            <Pressable onPress={() => { void send() }} disabled={thinking || !draft.trim()} hitSlop={8}>
              <Text style={[s.send, (!draft.trim() || thinking) && { color: c.t3 }]}>发送</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  empty: { color: c.t3, fontSize: 15, textAlign: 'center', marginTop: 40 },
  older: { alignSelf: 'center', padding: 10 },
  olderText: { color: c.accInk, fontSize: 13 },
  day: { color: c.t3, fontSize: 13, textAlign: 'center', marginTop: 16, marginBottom: 4 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: c.accTint },
  assistant: { alignSelf: 'flex-start', backgroundColor: c.card },
  text: { fontSize: 15, lineHeight: 22, color: c.t1 },
  link: { color: c.accInk, fontSize: 13, marginTop: 8 },
  thinking: { color: c.t3, fontSize: 13, padding: 8 },
  bar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  compose: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 16, minHeight: 50 },
  input: { flex: 1, fontSize: 15, color: c.t1, paddingVertical: 10, maxHeight: 100 },
  send: { fontSize: 15, color: c.accInk, paddingLeft: 12 },
})

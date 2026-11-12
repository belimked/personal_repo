import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useEffect, useRef, useState } from 'react'
import { AppState, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { api, askWithFallback, streamChat, type Recording, type RoutePlace } from '@/lib/api'
import { toast } from '@/components/Toast'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Brief, briefHeading, briefQueue } from '@/components/Brief'
import { HoldToTalk, TalkOverlay, VoiceNote, voiceProgress } from '@/components/HoldToTalk'
import { currentCoordinates, openMap } from '@/lib/location'
import { Panel } from '@/components/Panel'
import type { Sent } from '@/lib/recorder'
import { Switcher } from '@/components/Switcher'
import { Button, Card, Chev, Icon, Row, ui } from '@/components/ui'
import { BRIEF_ITEMS } from '@/lib/data'
import { useStore, type Outcome } from '@/lib/store'
import { isOpen } from '@/lib/items'
import { c, mono } from '@/lib/theme'

/** 01 简报封面 / 03 结束页（3 件都过完后） */
export default function Home() {
  const { states, token, items, outcomes, messages: allHistory, hasMore, refresh } = useStore()
  const [panel, setPanel] = useState(false)
  const [compose, setCompose] = useState(false)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const say = () => setCompose(true)
  const [local, setLocal] = useState<{ role: 'user' | 'assistant'; content: string; voice?: { id: string; ms: number }; meta?: { search?: string; route?: RoutePlace } }[]>([])
  // 首页只放最近 3 条，更早的去“我的 › 聊天记录”
  const history = allHistory.slice(-3)
  const messages = [...history, ...local.filter((m) => m.voice || !history.some((h) => h.role === m.role && h.content === m.content))]
  const scrollHeight = useRef(0)
  const scrollY = useRef(0)
  const preserve = useRef<{ height: number; y: number } | null>(null)
  const scrollAfter = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100)
  const send = async () => {
    const message = draft.trim()
    if (!message || thinking || !token) return
    setCompose(false); setDraft(''); setThinking(true)
    setLocal((p) => [...p, { role: 'user', content: message }, { role: 'assistant', content: '' }])
    scrollAfter()
    const put = (content: string, meta?: { search?: string; route?: RoutePlace }) => { setLocal((p) => { const next = [...p]; next[next.length - 1] = { role: 'assistant', content, meta }; return next }); scrollAfter() }
    const routeMatch = /^(从这里)?(去|到)(.{1,30}?)(要多久|多久|多远|怎么走)/.exec(message)
    if (routeMatch) {
      try {
        const r = await api.route(token, routeMatch[3].trim(), await currentCoordinates())
        put(`从你现在的位置去${r.place.name}，开车约 ${r.driving_min} 分钟${r.transit_min != null ? `，公交约 ${r.transit_min} 分钟` : ''}（预估）`, { route: r.place })
      } catch { put('暂时没法估算路线，请稍后再试。') }
    } else if (/^(帮我)?[搜查找]/.test(message)) {
      try {
        const r = await askWithFallback(token, message)
        put([r.answer || '找到这些结果：', ...r.things.slice(0, 5).map((t) => `· ${t.title}${t.due ? `（${t.due}）` : ''}`)].join('\n'), { search: message })
      } catch { put('现在搜不了，稍后再试。') }
    } else {
      let text = ''
      try { put(await streamChat(token, message, (delta) => { text += delta; put(text) })) }
      catch { try { put((await api.chat(token, message)).reply) } catch { put(text ? `${text}\n连接中断，请重试。` : '现在连不上，这句没发出去。稍后再试一次。') } }
    }
    setThinking(false); scrollAfter(); void refresh(true).then(() => { if (!/^(帮我)?[搜查找]/.test(message) && !routeMatch) setLocal((p) => p.filter((m) => !!m.voice || !!m.meta)) })
  }
  // 按住说的语音：记下每条的处理状态，气泡和按钮下方的提示跟着变；处理完重新拉对话，用原话 + 小禾的回答替换气泡。
  // 失败的保留气泡，点开在纪要页重试。收到推送或回到前台时立刻查一次。
  const [voices, setVoices] = useState<Record<string, Recording>>({})
  const [poke, setPoke] = useState(0)
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null)
  const voice = (sent: Sent) => {
    toast('收到，正在转成文字')
    setTimeout(scrollAfter, 800)
    setLocal((p) => [...p, { role: 'user', content: '', voice: { id: sent.recording.id, ms: sent.ms } }])
    setVoices((v) => ({ ...v, [sent.recording.id]: sent.recording }))
  }
  const waiting = Object.keys(voices).filter((id) => voices[id].status !== 'done' && voices[id].status !== 'failed')
  const waitKey = waiting.join(',')
  useEffect(() => {
    const a = Notifications.addNotificationReceivedListener(() => setPoke((n) => n + 1))
    const b = AppState.addEventListener('change', (st) => { if (st === 'active') setPoke((n) => n + 1) })
    return () => { a.remove(); b.remove() }
  }, [])
  useEffect(() => {
    if (!token || !waitKey) return
    const ids = waitKey.split(',')
    let alive = true
    const check = async () => {
      const got = await Promise.all(ids.map((id) => api.recording(token, id).then((r) => r.recording).catch(() => null)))
      if (!alive) return
      const done = ids.filter((_, i) => got[i]?.status === 'done')
      // 先把对话拉回来再改状态：改状态会让这个 effect 重跑，先改的话下面的替换会被丢掉（0.9.3 里“已回复”但文字不变的原因）
      const r = done.length ? await api.messages(token, 10).catch(() => null) : null
      if (!alive) return
      setVoices((v) => {
        const next = { ...v }
        ids.forEach((id, i) => { const st = got[i]; if (st && !(st.status === 'done' && !r)) next[id] = st })
        return next
      })
      if (got.some((st) => st?.status === 'failed')) toast('这条语音没能处理，点气泡重试')
      if (!r) return
      setLocal((p) => p.filter((m) => !m.voice || !done.includes(m.voice.id)).filter((m) => !r.messages.some((x) => x.role === m.role && x.content === m.content)))
      void refresh(true).then(() => { toast('小禾回复了'); scrollAfter() })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
    void check()
    const t = setInterval(() => { void check() }, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [waitKey, token, poke, refresh])
  const lastVoice = Object.keys(voices).at(-1)
  const voiceTip = waiting.length ? `${voiceProgress(voices[waiting[waiting.length - 1]])}…`
    : lastVoice && voices[lastVoice].status === 'failed' ? '这条语音没能处理，点下方气泡重试' : ''
  const pending = BRIEF_ITEMS.filter((i) => states[i.id] === 'pending')
  const allDone = pending.length === 0

  const open = (id?: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: '/review', params: id ? { id } : {} }) }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={s.switcher}><Switcher onPress={() => setPanel(true)} /></View>
      <ScrollView ref={scroll} contentContainerStyle={s.body} bounces={false}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y }} scrollEventThrottle={16}
        onContentSizeChange={(_, height) => { if (preserve.current !== null) { scroll.current?.scrollTo({ y: Math.max(0, preserve.current.y + height - preserve.current.height), animated: false }); preserve.current = null } scrollHeight.current = height }}>
        {token ? Object.keys(outcomes).length && briefQueue(items).every((i) => i.id in outcomes) ? <RealFinished onSay={say} onSent={voice} tip={voiceTip} /> : <Brief onSay={say} onSent={voice} tip={voiceTip} /> : allDone ? <Finished onSay={say} onSent={voice} tip={voiceTip} /> : (
          <>
            <View style={s.head}>
              <Text style={ui.title}>{pending.length} 件事等你定</Text>
              <Text style={ui.lede}>都已备好办法，过一遍约 2 分钟</Text>
            </View>
            <Card>
              <BriefTop />
              {BRIEF_ITEMS.map((it, i) => {
                const st = states[it.id]
                return (
                  <Pressable key={it.id} onPress={() => open(it.id)} style={({ pressed }) => [s.item, pressed && { backgroundColor: c.raised }]}>
                    {i > 0 && <View style={s.itemSep} />}
                    <Text style={[s.no, mono]}>{it.no}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.h, st !== 'pending' && { color: c.t3 }]}>{it.title}</Text>
                      <Text style={s.s}>{st === 'done' ? it.doneLabel : st === 'later' ? '17:30 再提醒' : it.summary}</Text>
                    </View>
                    {it.due && st === 'pending' ? <Text style={[s.meta, mono]}>{it.due}</Text> : <View style={{ marginTop: 4 }}><Chev /></View>}
                  </Pressable>
                )
              })}
            </Card>
            <View style={{ flex: 1 }} />
            <View style={s.actions}>
              <Button title="开始" onPress={() => open()} />
              <HoldToTalk title="说一句" onTap={say} onSent={voice} />
            </View>
            {voiceTip ? <Text style={[s.foot, s.tip]}>{voiceTip}</Text> : <Text style={s.foot}>另有 7 件我在办，不用你管</Text>}
          </>
        )}
        <View style={s.chat}>
          {hasMore || allHistory.length > 3 ? <Pressable onPress={() => router.push({ pathname: '/chats', params: { from: 'home' } })} style={s.older}><Text style={{ color: c.accInk, fontSize: 13 }}>查看更早的对话</Text></Pressable> : null}
          {messages.map((m, i) => 'voice' in m && m.voice ? <VoiceNote key={i} id={m.voice.id} ms={m.voice.ms} recording={voices[m.voice.id]} /> : <View key={i} style={[s.bubble, m.role === 'user' ? s.mine : s.assistant]}><Text style={s.bubbleText}>{m.content}</Text>{m.meta?.search ? <Pressable onPress={() => router.push({ pathname: '/search', params: { q: m.meta!.search } })}><Text style={s.resultLink}>看全部结果</Text></Pressable> : null}{m.meta?.route ? <Pressable onPress={() => openMap(m.meta!.route!)}><Text style={s.resultLink}>在地图中打开</Text></Pressable> : null}</View>)}
        </View>
      </ScrollView>
      <Modal visible={compose} transparent animationType="slide" onRequestClose={() => setCompose(false)}>
        <KeyboardAvoidingView behavior="padding" style={s.modal}><Pressable style={s.shade} onPress={() => setCompose(false)} /><View style={s.composeCard}><TextInput autoFocus multiline value={draft} onChangeText={setDraft} placeholder="有什么事交给我？" placeholderTextColor={c.t3} style={s.composeInput} /><Pressable disabled={!draft.trim() || thinking} onPress={() => { void send() }}><Text style={[s.send, (!draft.trim() || thinking) && { color: c.t3 }]}>发送</Text></Pressable></View></KeyboardAvoidingView>
      </Modal>
      <Panel visible={panel} onClose={() => setPanel(false)} onSettings={() => router.navigate('/me')} />
      <TalkOverlay />
    </SafeAreaView>
  )
}

function RealFinished({ onSay, onSent, tip }: { onSay: () => void; onSent: (s: Sent) => void; tip: string }) {
  const { outcomes, items, brief, syncedAt } = useStore()
  const entries = Object.values(outcomes)
  const later = entries.filter((o) => o.result === 'later')
  const others = items.filter(isOpen).length - briefQueue(items).filter((i) => i.kind === 'todo').length
  const head = briefHeading(brief, syncedAt)
  const label = (o: Outcome) => o.result === 'later' ? `${o.remind && new Date(o.remind).toDateString() !== new Date().toDateString() ? '明天 9:00' : '17:30'} 提醒` : ({ todo: '已安排', watch: '交给小禾', mine: '我自己办', drop: '不用了' } as const)[o.result]
  return <>
    <View style={[s.head, { paddingTop: 40 }]}><View style={s.done}><Icon name="checkmark" size={22} color={c.ok} weight="semibold" /></View>
      <Text style={[ui.title, { marginTop: 16 }]}>今天的都过完了</Text>
      <Text style={ui.lede}>处理了 {entries.length} 件{later.length ? `，${later.length} 件${later.some((o) => o.remind && new Date(o.remind).toDateString() !== new Date().toDateString()) ? '明天 9:00' : '17:30'} 再提醒你` : ''}</Text></View>
    <Card><View style={s.top}><Text style={s.topText}>{head.day}</Text><Text style={[s.topText, mono, { color: c.t3 }]}>{head.time}</Text></View>
      {entries.map((o, n) => <View key={n} style={s.item}>{n > 0 ? <View style={s.itemSep} /> : null}<Text style={[s.no, mono]}>{String(n + 1).padStart(2, '0')}</Text><Text style={[s.h, { flex: 1 }]} numberOfLines={1}>{o.title}</Text><View style={s.state}><Icon name={o.result === 'later' ? 'clock' : 'checkmark'} size={13} color={o.result === 'later' ? c.t3 : c.ok} /><Text style={[s.stateText, o.result !== 'later' && { color: c.ok }]}>{label(o)}</Text></View></View>)}
    </Card>
    <Card style={{ marginTop: 16 }}><Row first label={`另有 ${Math.max(0, others)} 件我在办`} value="不用你管" onPress={() => router.navigate('/watch')} left={<Icon name="shield" size={20} color={c.t2} />} /></Card>
    <View style={{ flex: 1 }} /><View style={s.actions}><HoldToTalk title="有别的事，说一句" style={{ flex: 1 }} onTap={onSay} onSent={onSent} /></View>
    {tip ? <Text style={[s.foot, s.tip]}>{tip}</Text> : null}
  </>
}

function BriefTop() {
  return (
    <View style={s.top}>
      <Text style={s.topText}>周五简报</Text>
      <Text style={[s.topText, mono, { color: c.t3 }]}>16:00</Text>
    </View>
  )
}

function Finished({ onSay, onSent, tip }: { onSay: () => void; onSent: (s: Sent) => void; tip: string }) {
  const { states } = useStore()
  const done = BRIEF_ITEMS.filter((i) => states[i.id] === 'done').length
  const later = BRIEF_ITEMS.length - done
  return (
    <>
      <View style={[s.head, { paddingTop: 40 }]}>
        <View style={s.done}><Icon name="checkmark" size={22} color={c.ok} weight="semibold" /></View>
        <Text style={[ui.title, { marginTop: 16 }]}>今天的都过完了</Text>
        <Text style={ui.lede}>处理了 {done} 件{later > 0 ? '，' + later + ' 件 17:30 再提醒你' : ''}</Text>
      </View>
      <Card>
        <BriefTop />
        {BRIEF_ITEMS.map((it, i) => {
          const ok = states[it.id] === 'done'
          return (
            <View key={it.id} style={[s.item, { alignItems: 'center' }]}>
              {i > 0 && <View style={s.itemSep} />}
              <Text style={[s.no, mono]}>{it.no}</Text>
              <Text style={[s.h, { flex: 1 }]}>{it.title}</Text>
              <View style={s.state}>
                <Icon name={ok ? 'checkmark' : 'clock'} size={13} color={ok ? c.ok : c.t3} />
                <Text style={[s.stateText, ok && { color: c.ok }]}>{ok ? it.doneLabel : '17:30 提醒'}</Text>
              </View>
            </View>
          )
        })}
      </Card>
      <Card style={{ marginTop: 16 }}>
        <Row first label="另有 7 件我在办" value="不用你管" onPress={() => router.navigate('/watch')}
          left={<Icon name="shield" size={20} color={c.t2} />} />
      </Card>
      <View style={{ flex: 1 }} />
      <View style={s.actions}>
        <HoldToTalk title="有别的事，说一句" style={{ flex: 1 }} onTap={onSay} onSent={onSent} />
      </View>
      {tip ? <Text style={[s.foot, s.tip]}>{tip}</Text> : null}
    </>
  )
}

const s = StyleSheet.create({
  body: { flexGrow: 1, paddingHorizontal: 16 },
  switcher: { backgroundColor: c.bg, paddingHorizontal: 16 },
  modal: { flex: 1, justifyContent: 'flex-end' }, shade: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#0007' }, composeCard: { backgroundColor: c.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 }, composeInput: { flex: 1, backgroundColor: c.card, borderRadius: 12, padding: 12, maxHeight: 120, fontSize: 16, color: c.t1 }, send: { fontSize: 16, color: c.accInk },
  chat: { paddingTop: 16, paddingBottom: 12, gap: 8 },
  older: { alignSelf: 'center', padding: 10 },
  resultLink: { color: c.accInk, fontSize: 13, marginTop: 8 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: c.accTint },
  assistant: { alignSelf: 'flex-start', backgroundColor: c.card },
  bubbleText: { fontSize: 15, lineHeight: 22, color: c.t1 },
  head: { paddingHorizontal: 4, paddingVertical: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  topText: { fontSize: 13, lineHeight: 18, color: c.t2 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16 },
  itemSep: { position: 'absolute', top: 0, left: 56, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  no: { width: 28, fontSize: 13, lineHeight: 24, color: c.t3 },
  h: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: c.t1 },
  s: { fontSize: 15, lineHeight: 22, color: c.t2, marginTop: 2 },
  meta: { fontSize: 13, lineHeight: 24, color: c.t2 },
  actions: { flexDirection: 'row', gap: 12, paddingTop: 16, paddingBottom: 12 },
  foot: { fontSize: 13, lineHeight: 18, color: c.t3, textAlign: 'center', paddingBottom: 12 },
  tip: { color: c.accInk },
  done: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.ok, alignItems: 'center', justifyContent: 'center' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stateText: { fontSize: 13, lineHeight: 18, color: c.t3 },
})

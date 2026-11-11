import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { api, type Recording } from '@/lib/api'
import { SafeAreaView } from 'react-native-safe-area-context'
import { HoldToTalk, TalkOverlay, VoiceNote } from '@/components/HoldToTalk'
import { Panel } from '@/components/Panel'
import type { Sent } from '@/lib/recorder'
import { Switcher } from '@/components/Switcher'
import { Button, Card, Chev, Icon, Row, ui } from '@/components/ui'
import { BRIEF_ITEMS } from '@/lib/data'
import { useStore } from '@/lib/store'
import { c, mono } from '@/lib/theme'

/** 01 简报封面 / 03 结束页（3 件都过完后） */
export default function Home() {
  const { states, token } = useStore()
  const [panel, setPanel] = useState(false)
  const input = useRef<React.ElementRef<typeof TextInput>>(null)
  const say = () => input.current?.focus()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; voice?: { id: string; ms: number } }[]>([])
  // 按住说的语音：记下每条的处理状态，气泡和按钮下方的提示跟着变；处理完重新拉对话，用原话 + 小禾的回答替换气泡。
  // 失败的保留气泡，点开在纪要页重试。收到推送或回到前台时立刻查一次。
  const [voices, setVoices] = useState<Record<string, Recording['status']>>({})
  const [poke, setPoke] = useState(0)
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null)
  const follow = useRef(false)
  const voice = (sent: Sent) => {
    follow.current = true
    setMessages((p) => [...p, { role: 'user', content: '', voice: { id: sent.recording.id, ms: sent.ms } }])
    setVoices((v) => ({ ...v, [sent.recording.id]: 'queued' }))
  }
  const waiting = Object.keys(voices).filter((id) => voices[id] !== 'done' && voices[id] !== 'failed')
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
      const got = await Promise.all(ids.map((id) => api.recording(token, id).then((r) => r.recording.status).catch(() => null)))
      if (!alive) return
      setVoices((v) => {
        const next = { ...v }
        ids.forEach((id, i) => { const st = got[i]; if (st) next[id] = st })
        return next
      })
      const done = ids.filter((_, i) => got[i] === 'done')
      if (!done.length) return
      const r = await api.messages(token).catch(() => null)
      if (!r || !alive) return
      follow.current = true
      const list = r.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      setMessages((p) => [...list, ...p.filter((m) => m.voice && !done.includes(m.voice.id))])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
    void check()
    const t = setInterval(() => { void check() }, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [waitKey, token, poke])
  const lastVoice = Object.keys(voices).at(-1)
  const voiceTip = waiting.length
    ? voices[waiting[waiting.length - 1]] === 'summarizing' ? '听清了，小禾正在想怎么回你…' : '语音已发出，正在转成文字…'
    : lastVoice && voices[lastVoice] === 'failed' ? '这条语音没能处理，点下方气泡重试' : ''
  const [thinking, setThinking] = useState(false)
  useEffect(() => {
    let current = true
    if (token) void api.messages(token).then((r) => { if (current) setMessages(r.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))) }).catch(() => {})
    return () => { current = false }
  }, [token])
  const send = async () => {
    const message = draft.trim()
    if (!message || thinking) return
    follow.current = true
    setDraft(''); setMessages((p) => [...p, { role: 'user', content: message }]); setThinking(true)
    let reply = BRIEF_ITEMS[0].reply
    if (token) try { reply = (await api.chat(token, message)).reply || reply } catch { /* 离线用现有预设回复 */ }
    setMessages((p) => [...p, { role: 'assistant', content: reply }]); setThinking(false)
  }
  const pending = BRIEF_ITEMS.filter((i) => states[i.id] === 'pending')
  const allDone = pending.length === 0

  const open = (id?: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: '/review', params: id ? { id } : {} }) }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView ref={scroll} contentContainerStyle={s.body} bounces={false}
        onContentSizeChange={() => { if (follow.current) { follow.current = false; scroll.current?.scrollToEnd({ animated: true }) } }}>
        <Switcher onPress={() => setPanel(true)} />
        {allDone ? <Finished onSay={say} onSent={voice} tip={voiceTip} /> : (
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
          {messages.map((m, i) => m.voice ? <VoiceNote key={i} id={m.voice.id} ms={m.voice.ms} status={voices[m.voice.id]} /> : <View key={i} style={[s.bubble, m.role === 'user' ? s.mine : s.assistant]}><Text style={s.bubbleText}>{m.content}</Text></View>)}
          {thinking ? <Text style={s.thinking}>小禾正在想…</Text> : null}
          <View style={s.compose}>
            <TextInput ref={input} style={s.input} value={draft} onChangeText={setDraft} placeholder="有什么事交给我？" placeholderTextColor={c.t3} multiline />
            <Pressable onPress={send} disabled={thinking || !draft.trim()}><Text style={[s.send, (!draft.trim() || thinking) && { color: c.t3 }]}>发送</Text></Pressable>
          </View>
        </View>
      </ScrollView>
      <Panel visible={panel} onClose={() => setPanel(false)} onSettings={() => router.navigate('/me')} />
      <TalkOverlay />
    </SafeAreaView>
  )
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
  chat: { paddingTop: 16, paddingBottom: 20, gap: 8 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: c.accTint },
  assistant: { alignSelf: 'flex-start', backgroundColor: c.card },
  bubbleText: { fontSize: 15, lineHeight: 22, color: c.t1 },
  thinking: { color: c.t3, fontSize: 13, padding: 8 },
  compose: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 16, minHeight: 50 },
  input: { flex: 1, fontSize: 15, color: c.t1, paddingVertical: 10, maxHeight: 100 },
  send: { fontSize: 15, color: c.accInk, paddingLeft: 12 },
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

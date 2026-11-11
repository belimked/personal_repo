import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NavBar } from '@/components/NavBar'
import { Card, GroupLabel, Icon, ui } from '@/components/ui'
import { api, type SearchResult } from '@/lib/api'
import { when } from '@/lib/items'
import { clock } from '@/lib/recorder'
import { useStore } from '@/lib/store'
import { c, mono } from '@/lib/theme'

const short = (at: string) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const EXAMPLES = ['体检', '报销', '周报', '供应商']

/** 搜索：说过的话 / 事情 / 资料，点进去就是那件事 */
export default function Search() {
  const { token } = useStore()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ q: string; data: SearchResult | null; error: string }>({ q: '', data: null, error: '' })
  const query = q.trim()

  useEffect(() => {
    if (!token || !query) return
    let alive = true
    const t = setTimeout(() => {
      void api.search(token, query)
        .then((data) => { if (alive) setRes({ q: query, data, error: '' }) })
        .catch((e: Error) => { if (alive) setRes({ q: query, data: null, error: e.message }) })
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [token, query])

  const ready = res.q === query && !!query
  const data = ready ? res.data : null
  const empty = data && !data.said.length && !data.things.length && !data.files.length
  const openRec = (id?: string) => { if (id) { Haptics.selectionAsync(); router.push({ pathname: '/minutes', params: { id } }) } }
  const mark = (text: string) => {
    const i = text.toLowerCase().indexOf(query.toLowerCase())
    if (i < 0) return <Text>{text}</Text>
    return <Text>{text.slice(0, i)}<Text style={s.hit}>{text.slice(i, i + query.length)}</Text>{text.slice(i + query.length)}</Text>
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <NavBar title="搜索" />
      <View style={s.box}>
        <Icon name="magnifyingglass" size={17} color={c.t3} />
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="说过的话、事情、资料都能搜" placeholderTextColor={c.t3}
          style={s.input} returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!query ? <>
          <GroupLabel top={16}>试试搜</GroupLabel>
          <View style={s.chips}>{EXAMPLES.map((e) => (
            <Pressable key={e} onPress={() => setQ(e)} style={({ pressed }) => [s.chip, pressed && { backgroundColor: c.raised }]}><Text style={s.chipText}>{e}</Text></Pressable>
          ))}</View>
          <Text style={s.note}>按关键词查你的录音原文、纪要、和小禾的对话，以及所有事项。</Text>
        </> : !ready ? <ActivityIndicator color={c.acc} style={{ marginTop: 32 }} />
          : res.error ? <Text style={s.note}>{res.error}</Text>
          : empty ? <Text style={[s.note, { textAlign: 'center', paddingTop: 32 }]}>没找到“{query}”相关的内容</Text>
          : data ? <>
            {data.things.length ? <>
              <GroupLabel top={16}>事情</GroupLabel>
              <Card>{data.things.map((t, i) => {
                const due = when(t.due)
                return (
                  <Pressable key={t.id} onPress={() => t.recording_id ? openRec(t.recording_id) : router.navigate('/watch')} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.raised }]}>
                    {i > 0 && <View style={ui.sep} />}
                    <Icon name={t.done ? 'checkmark.circle' : t.kind === 'watch' ? 'eye' : t.kind === 'idea' ? 'lightbulb' : 'circle'} size={17} color={t.done ? c.ok : c.t3} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.t, t.done && { color: c.t3 }]} numberOfLines={2}>{mark(t.title)}</Text>
                      {t.owner ? <Text style={s.meta}>{t.owner}{t.done ? ' · 已办完' : ''}</Text> : t.done ? <Text style={s.meta}>已办完</Text> : null}
                    </View>
                    {due.text && !t.done ? <Text style={[s.meta, due.late && { color: c.bad }]}>{due.text}</Text> : null}
                  </Pressable>
                )
              })}</Card>
            </> : null}
            {data.said.length ? <>
              <GroupLabel>说过的话</GroupLabel>
              <Card>{data.said.map((h, i) => (
                <Pressable key={i} disabled={!h.recording_id} onPress={() => openRec(h.recording_id)} style={({ pressed }) => [s.col, pressed && { backgroundColor: c.raised }]}>
                  {i > 0 && <View style={ui.sep} />}
                  <Text style={[s.meta, { marginTop: 0 }]}>
                    {h.type === 'chat' ? (h.role === 'user' ? '你对小禾说' : '小禾回复') : (h.title || '录音')}
                    {' · '}{short(h.at)}{h.start_ms != null ? <Text style={mono}>{' · ' + clock(h.start_ms)}</Text> : null}
                  </Text>
                  <Text style={s.quote} numberOfLines={3}>{mark(h.snippet)}</Text>
                </Pressable>
              ))}</Card>
            </> : null}
            {data.files.length ? <>
              <GroupLabel>资料</GroupLabel>
              <Card>{data.files.map((f, i) => (
                <Pressable key={f.recording_id} onPress={() => openRec(f.recording_id)} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.raised }]}>
                  {i > 0 && <View style={ui.sep} />}
                  <Icon name={f.kind === 'file' ? 'doc.text' : 'waveform'} size={17} color={c.t3} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.t} numberOfLines={1}>{mark(f.title || '录音')}</Text>
                    <Text style={s.meta} numberOfLines={2}>{f.snippet ? mark(f.snippet) : short(f.at)}</Text>
                  </View>
                </Pressable>
              ))}</Card>
            </> : null}
          </> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  box: { marginHorizontal: 16, height: 40, borderRadius: 10, backgroundColor: '#E4E4EA', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 17, color: c.t1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: c.card, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  chipText: { fontSize: 15, color: c.t1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 52 },
  col: { paddingVertical: 12, paddingHorizontal: 16, gap: 4 },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  quote: { fontSize: 15, lineHeight: 22, color: c.t1 },
  meta: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  hit: { backgroundColor: '#FFE9A8', color: c.t1 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 12 },
})

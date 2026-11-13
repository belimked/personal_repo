import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { showSheet } from '@/components/Sheet'
import { Button, Card, GroupLabel, Icon, ui } from '@/components/ui'
import { api, ApiError, type Minutes, type Recording, type Transcript } from '@/lib/api'
import { clock, fileType, isFile, sceneLabel } from '@/lib/recorder'
import { useStore } from '@/lib/store'
import { c, mono } from '@/lib/theme'

const statusText: Record<Recording['status'], string> = {
  queued: '排队中，马上开始', transcribing: '正在把录音转成文字', summarizing: '文字已转好，正在整理纪要', done: '', failed: '这段录音没能处理完',
}
const fileStatusText: Record<Recording['status'], string> = {
  queued: '排队中，马上开始', transcribing: '正在读里面的文字', summarizing: '文字读好了，正在整理', done: '', failed: '这份资料没能处理完',
}
const busy = (r: Recording | null) => !!r && (r.status === 'queued' || r.status === 'transcribing' || r.status === 'summarizing')

type Loaded = { rec: Recording | null; min: Minutes | null; text: Transcript | null; error: string }

async function fetchAll(token: string | null, id?: string): Promise<Loaded> {
  if (!token || !id) return { rec: null, min: null, text: null, error: token ? '找不到这段录音' : '登录后才能查看纪要' }
  try {
    const { recording } = await api.recording(token, id)
    const hasText = recording.status === 'summarizing' || recording.status === 'done' || recording.status === 'failed'
    const [min, text] = await Promise.all([
      recording.status === 'done' ? api.minutes(token, id).catch(() => null) : Promise.resolve(null),
      hasText ? api.transcript(token, id).catch(() => null) : Promise.resolve(null),
    ])
    return { rec: recording, min, text, error: '' }
  } catch (e) {
    return { rec: null, min: null, text: null, error: e instanceof ApiError && e.status === 404 ? '找不到这段录音' : e instanceof Error ? e.message : '加载失败' }
  }
}

/** 录音纪要和原文：从推送、录音列表或首页语音消息点进来 */
export default function MinutesScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { token } = useStore()
  const [data, setData] = useState<Loaded>({ rec: null, min: null, text: null, error: '' })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'minutes' | 'text'>('minutes')
  const { rec, min, text, error } = data

  const apply = useCallback((r: Loaded) => { setData(r); setLoading(false) }, [])
  const load = useCallback(async () => { setLoading(true); apply(await fetchAll(token, id)) }, [apply, token, id])
  useEffect(() => {
    let alive = true
    void fetchAll(token, id).then((r) => { if (alive) apply(r) })
    return () => { alive = false }
  }, [apply, token, id])
  // 处理中每 5 秒刷新
  useEffect(() => {
    if (!busy(rec)) return
    const t = setInterval(() => { void fetchAll(token, id).then(apply) }, 5000)
    return () => clearInterval(t)
  }, [rec, token, id, apply])

  const retry = async () => {
    if (!token || !rec) return
    try { await api.retry(token, rec.id); await load() } catch (e) { apply({ ...data, error: e instanceof Error ? e.message : '没能重试' }) }
  }
  // 改标签：工作 / 生活 / 工作和生活。后台按新标签重新整理要办的事。
  const relabel = () => {
    if (!token || !rec || rec.status !== 'done') return
    const opts = (['work', 'life', 'mixed'] as const).filter((k) => k !== rec.scene)
    showSheet({
      title: '这份内容算哪一类？', message: '改了以后，我会按新的类别重新整理要办的事。',
      options: [...opts.map((k) => sceneLabel[k]), '取消'], cancelButtonIndex: opts.length,
    }, (n) => {
      if (n >= opts.length) return
      void api.setScene(token, rec.id, opts[n]).then(load).catch((e: Error) => apply({ ...data, error: e.message || '没能改标签' }))
    })
  }
  const list = (items?: string[]) => items?.length
    ? <Card>{items.map((t, i) => <View key={i} style={s.line}>{i > 0 && <View style={ui.sep} />}<Text style={s.text}>{t}</Text></View>)}</Card>
    : null
  const segments = text?.segments?.length ? text.segments : text?.text ? [{ text: text.text }] : []
  const speakers = new Set(segments.map((g) => g.speaker ?? 0)).size
  const file = !!rec && isFile(rec)
  const pages = segments.some((g) => g.page != null) && segments.length > 1

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={s.nav}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} hitSlop={8} style={s.back}>
          <Icon name="chevron.left" size={20} color={c.accInk} weight="semibold" />
          <Text style={{ fontSize: 17, color: c.accInk }}>返回</Text>
        </Pressable>
        <Text style={s.mid}>{file ? '资料' : min ? '会议纪要' : '录音'}</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading && !!rec} onRefresh={load} />}>
        {loading && !rec ? <ActivityIndicator color={c.acc} style={{ marginTop: 48 }} /> : null}
        {error ? <View style={{ paddingTop: 32 }}>
          <Text style={s.note}>{error}</Text>
          <Button kind="text" title="重试" onPress={load} />
        </View> : null}

        {rec && !error ? <>
          <Text style={[ui.title, { paddingTop: 16 }]}>{min?.title || rec.title || (file ? '新资料' : '新录音')}</Text>
          <Text style={ui.srcText}>{[
            new Date(rec.recorded_at || rec.created_at).toLocaleString('zh-CN', { hour12: false }),
            file ? fileType(rec.mime) : rec.duration_s ? clock(rec.duration_s * 1000) : '',
          ].filter(Boolean).join(' · ')}</Text>
          {rec.status === 'done' ? <Pressable onPress={relabel} hitSlop={8} style={s.tag} accessibilityLabel="改标签">
            <Text style={s.tagText}>{rec.scene ? sceneLabel[rec.scene] : '未分类'}</Text>
            <Icon name="chevron.down" size={11} color={c.accInk} />
          </Pressable> : null}

          {busy(rec) || rec.status === 'failed' ? <View style={s.status}>
            {busy(rec) ? <ActivityIndicator size="small" color={c.acc} /> : <Icon name="exclamationmark.circle" size={16} color={c.bad} />}
            <Text style={[s.statusText, rec.status === 'failed' && { color: c.bad }]}>
              {(file ? fileStatusText : statusText)[rec.status]}{rec.status === 'queued' && rec.queue_position ? `（前面 ${Math.max(0, rec.queue_position - 1)} 份）` : ''}{file && rec.status === 'failed' && rec.error ? `：${rec.error}` : ''}
            </Text>
            {rec.status === 'failed' ? <Button kind="text" title="重试" onPress={retry} /> : null}
          </View> : null}

          {segments.length ? <View style={s.seg}>
            {(['minutes', 'text'] as const).map((k) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[s.segItem, tab === k && s.segOn]}>
                <Text style={[s.segText, tab === k && { color: c.t1, fontWeight: '500' }]}>{k === 'minutes' ? (file ? '整理' : '纪要') : '原文'}</Text>
              </Pressable>
            ))}
          </View> : null}

          {tab === 'text' && segments.length ? <>
            <GroupLabel>{file ? (rec.mime?.startsWith('image/') ? '认出的文字' : pages ? `${segments.length} 页` : '正文') : speakers > 1 ? `${speakers} 人说话` : '转写原文'}</GroupLabel>
            <Card>{segments.map((g, i) => (
              <View key={i} style={s.line}>
                {i > 0 && <View style={ui.sep} />}
                {pages && g.page != null ? <Text style={[s.meta, { marginTop: 0, marginBottom: 4 }]}>第 {g.page} 页</Text> : null}
                {!file && (speakers > 1 || g.start_ms != null) ? <Text style={[s.meta, mono, { marginTop: 0, marginBottom: 4 }]}>
                  {[speakers > 1 ? `说话人 ${(g.speaker ?? 0) + 1}` : '', g.start_ms != null ? clock(g.start_ms) : ''].filter(Boolean).join(' · ')}
                </Text> : null}
                <Text selectable style={s.text}>{g.text}</Text>
              </View>
            ))}</Card>
          </> : null}

          {tab === 'minutes' && min ? <>
            {min.summary ? <Text style={[ui.lede, { marginTop: 12 }]}>{min.summary}</Text> : null}
            {min.action_items?.length ? <>
              <GroupLabel>要办的事</GroupLabel>
              <Card>{min.action_items.map((a, i) => (
                <View key={i} style={s.line}>
                  {i > 0 && <View style={ui.sep} />}
                  <Text style={s.text}>{a.text}</Text>
                  {(a.owner || a.due) ? <Text style={s.meta}>{[a.owner, a.due].filter(Boolean).join(' · ')}</Text> : null}
                </View>
              ))}</Card>
              <Text style={s.note}>这些事已经加到你的事项里。</Text>
            </> : <Text style={s.note}>{file ? '这份资料里没有需要跟进的事。' : '这段录音里没有需要跟进的事。'}</Text>}
            {min.decisions?.length ? <><GroupLabel>定下来的</GroupLabel>{list(min.decisions)}</> : null}
            {min.points?.length ? <><GroupLabel>要点</GroupLabel>{list(min.points)}</> : null}
          </> : null}
          {tab === 'minutes' && !min && rec.status === 'summarizing' && segments.length ? <Text style={s.note}>{file ? '整理好前，可以先看原文。' : '纪要整理好前，可以先看原文。'}</Text> : null}
        </> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, width: 80 },
  mid: { fontSize: 17, fontWeight: '500', color: c.t1 },
  tag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: c.accTint },
  tagText: { fontSize: 13, color: c.accInk },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  statusText: { fontSize: 15, color: c.t2, flexShrink: 1 },
  seg: { flexDirection: 'row', backgroundColor: c.raised, borderRadius: 9, padding: 2, marginTop: 20 },
  segItem: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  segOn: { backgroundColor: c.card },
  segText: { fontSize: 13, color: c.t2 },
  line: { paddingVertical: 12, paddingHorizontal: 16 },
  text: { fontSize: 17, lineHeight: 24, color: c.t1 },
  meta: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 4 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 8 },
})

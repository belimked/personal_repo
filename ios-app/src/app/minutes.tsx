import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Card, GroupLabel, Icon, ui } from '@/components/ui'
import { api, ApiError, type Minutes, type Recording } from '@/lib/api'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

const statusText: Record<Recording['status'], string> = {
  queued: '排队中，稍后再来看', transcribing: '正在转写录音', summarizing: '正在整理纪要', done: '', failed: '这段录音没能处理完',
}

type Loaded = { rec: Recording | null; min: Minutes | null; error: string }

async function fetchMinutes(token: string | null, id?: string): Promise<Loaded> {
  if (!token || !id) return { rec: null, min: null, error: token ? '找不到这段录音' : '登录后才能查看纪要' }
  try {
    const { recording } = await api.recording(token, id)
    return { rec: recording, min: recording.status === 'done' ? await api.minutes(token, id) : null, error: '' }
  } catch (e) {
    return { rec: null, min: null, error: e instanceof ApiError && e.status === 404 ? '找不到这段录音' : e instanceof Error ? e.message : '加载失败' }
  }
}

/** 录音纪要：从推送点进来，或带 ?id= 打开 */
export default function MinutesScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { token } = useStore()
  const [rec, setRec] = useState<Recording | null>(null)
  const [min, setMin] = useState<Minutes | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const apply = useCallback((r: Loaded) => { setRec(r.rec); setMin(r.min); setError(r.error); setLoading(false) }, [])
  const load = useCallback(async () => { setLoading(true); apply(await fetchMinutes(token, id)) }, [apply, token, id])
  useEffect(() => {
    let alive = true
    void fetchMinutes(token, id).then((r) => { if (alive) apply(r) })
    return () => { alive = false }
  }, [apply, token, id])

  const list = (items?: string[]) => items?.length
    ? <Card>{items.map((t, i) => <View key={i} style={s.line}>{i > 0 && <View style={ui.sep} />}<Text style={s.text}>{t}</Text></View>)}</Card>
    : null

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={s.nav}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} hitSlop={8} style={s.back}>
          <Icon name="chevron.left" size={20} color={c.accInk} weight="semibold" />
          <Text style={{ fontSize: 17, color: c.accInk }}>返回</Text>
        </Pressable>
        <Text style={s.mid}>会议纪要</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading && !!rec} onRefresh={load} />}>
        {loading && !rec ? <ActivityIndicator color={c.acc} style={{ marginTop: 48 }} /> : null}
        {error ? <View style={{ paddingTop: 32 }}>
          <Text style={s.note}>{error}</Text>
          <Button kind="text" title="重试" onPress={load} />
        </View> : null}
        {rec && !min && !error ? <View style={{ paddingTop: 32 }}>
          <Text style={ui.title}>{rec.title || '录音'}</Text>
          <Text style={ui.lede}>{statusText[rec.status] || '纪要还没生成'}</Text>
          <Button kind="text" title="刷新" onPress={load} />
        </View> : null}
        {min ? <>
          <Text style={[ui.title, { paddingTop: 16 }]}>{min.title || rec?.title || '会议纪要'}</Text>
          {rec ? <Text style={ui.srcText}>{new Date(rec.recorded_at || rec.created_at).toLocaleString('zh-CN', { hour12: false })}</Text> : null}
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
          </> : null}
          {min.decisions?.length ? <><GroupLabel>定下来的</GroupLabel>{list(min.decisions)}</> : null}
          {min.points?.length ? <><GroupLabel>要点</GroupLabel>{list(min.points)}</> : null}
        </> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, width: 80 },
  mid: { fontSize: 17, fontWeight: '500', color: c.t1 },
  line: { paddingVertical: 12, paddingHorizontal: 16 },
  text: { fontSize: 17, lineHeight: 24, color: c.t1 },
  meta: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 4 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 8 },
})

import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Card, GroupLabel, Icon, ui } from '@/components/ui'
import { api, type Recording } from '@/lib/api'
import { clock, sceneLabel, statusLabel, useRecorder } from '@/lib/recorder'
import { useStore } from '@/lib/store'
import { c, mono } from '@/lib/theme'

const busy = (r: Recording) => r.status === 'queued' || r.status === 'transcribing' || r.status === 'summarizing'
const when = (r: Recording) => new Date(r.recorded_at || r.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** 录音（我的 › 录音）：录会议、导入音频、看历史录音和进度 */
export default function Records() {
  const { token, demo } = useStore()
  const rec = useRecorder()
  const [list, setList] = useState<Recording[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((n) => n + 1), [])
  useEffect(() => {
    if (!token) return
    let alive = true
    void api.recordings(token).then((r) => { if (alive) { setList(r.recordings); setLoading(false) } }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [token, tick])
  // 有处理中的录音时每 5 秒刷新一次
  useEffect(() => {
    if (!list.some(busy)) return
    const t = setInterval(reload, 5000)
    return () => clearInterval(t)
  }, [list, reload])

  const meeting = async () => {
    if (rec.mode === 'meeting') { if (await rec.finish()) reload(); return }
    if (rec.mode) return
    await rec.start('meeting')
  }
  const importFile = async () => { if (await rec.importFile()) reload() }
  const more = (r: Recording) => Alert.alert(r.title || '录音', undefined, [
    ...(r.status === 'failed' ? [{ text: '重试', onPress: () => { if (token) void api.retry(token, r.id).then(reload).catch((e: Error) => Alert.alert('没能重试', e.message)) } }] : []),
    { text: '删除', style: 'destructive' as const, onPress: () => { if (token) void api.removeRecording(token, r.id).then(reload).catch(() => {}) } },
    { text: '取消', style: 'cancel' as const },
  ])

  const recording = rec.mode === 'meeting'
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); reload() }} />}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/me')} hitSlop={8} style={s.back}>
          <Icon name="chevron.left" size={20} color={c.accInk} weight="semibold" />
          <Text style={{ fontSize: 17, color: c.accInk }}>我的</Text>
        </Pressable>
        <View style={{ paddingHorizontal: 4, paddingTop: 4, paddingBottom: 16 }}>
          <Text style={ui.title}>录音</Text>
          <Text style={ui.lede}>开会时录下来，我转成文字、整理纪要，要办的事直接记上。</Text>
        </View>

        <Card style={s.recCard}>
          {recording ? <>
            <View style={s.live}><View style={s.dot} /><Text style={s.liveText}>正在录音</Text></View>
            <Text style={[s.timer, mono]}>{clock(rec.ms)}</Text>
            <Text style={s.hint}>锁屏或切到别的 App 也会继续录</Text>
          </> : <>
            <Text style={[s.timer, mono, { color: c.t3 }]}>0:00</Text>
            <Text style={s.hint}>{demo ? '登录后才能录音' : '最长约 3 小时'}</Text>
          </>}
          <View style={s.recActions}>
            <Button title={recording ? '结束并上传' : '录会议'} icon={recording ? 'stop.fill' : 'mic.fill'} onPress={meeting} />
          </View>
          {recording ? <Button kind="text" title="放弃这段录音" onPress={() => Alert.alert('放弃这段录音？', '录下的内容不会保存。', [
            { text: '继续录', style: 'cancel' }, { text: '放弃', style: 'destructive', onPress: () => { void rec.cancel() } },
          ])} /> : <Button kind="text" title="导入已有的录音文件" onPress={importFile} />}
          {rec.uploading > 0 ? <View style={s.up}><ActivityIndicator size="small" color={c.acc} /><Text style={s.hint}>正在上传…</Text></View> : null}
        </Card>

        <GroupLabel>最近的录音</GroupLabel>
        {list.length === 0 ? <Card><View style={s.row}><Text style={[s.h, { color: c.t3 }]}>还没有录音</Text></View></Card> : (
          <Card>{list.map((r, i) => (
            <Pressable key={r.id} onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/minutes', params: { id: r.id } }) }} onLongPress={() => more(r)}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: c.raised }]}>
              {i > 0 && <View style={ui.sep} />}
              <View style={{ flex: 1 }}>
                <Text style={s.h} numberOfLines={1}>{r.title || (busy(r) ? '新录音' : '录音')}</Text>
                <Text style={s.meta}>{[when(r), r.duration_s ? clock(r.duration_s * 1000) : '', r.scene ? sceneLabel[r.scene] : ''].filter(Boolean).join(' · ')}</Text>
              </View>
              <View style={s.state}>
                {busy(r) ? <ActivityIndicator size="small" color={c.t3} /> : r.status === 'failed' ? <Icon name="exclamationmark.circle" size={15} color={c.bad} /> : null}
                <Text style={[s.stateText, r.status === 'failed' && { color: c.bad }]}>{statusLabel[r.status]}</Text>
              </View>
            </Pressable>
          ))}</Card>
        )}
        {list.length > 0 ? <Text style={s.note}>长按一段录音可以重试或删除。</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, alignSelf: 'flex-start' },
  recCard: { alignItems: 'center', paddingTop: 24, paddingBottom: 8, paddingHorizontal: 16 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.bad },
  liveText: { fontSize: 13, color: c.bad },
  timer: { fontSize: 44, lineHeight: 52, fontWeight: '300', color: c.t1, marginTop: 4 },
  hint: { fontSize: 13, lineHeight: 18, color: c.t3 },
  recActions: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 20 },
  up: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 60 },
  h: { fontSize: 17, lineHeight: 24, color: c.t1 },
  meta: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateText: { fontSize: 13, color: c.t3 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 8 },
})

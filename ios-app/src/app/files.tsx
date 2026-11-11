import * as Haptics from 'expo-haptics'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NavBar } from '@/components/NavBar'
import { Card, GroupLabel, Icon, ui } from '@/components/ui'
import { api, type Recording } from '@/lib/api'
import { clock, sceneLabel, statusLabel } from '@/lib/recorder'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

const busy = (r: Recording) => r.status === 'queued' || r.status === 'transcribing' || r.status === 'summarizing'
const when = (r: Recording) => new Date(r.recorded_at || r.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** 交给我的资料：按类型分组（会议录音 / 语音）；点开看纪要和原文 */
export default function Files() {
  const { token } = useStore()
  const [list, setList] = useState<Recording[] | null>(null)
  const load = useCallback(() => {
    if (!token) return
    let alive = true
    void api.recordings(token).then((r) => { if (alive) setList(r.recordings) }).catch(() => { if (alive) setList((p) => p ?? []) })
    return () => { alive = false }
  }, [token])
  useFocusEffect(load)

  const groups = [
    { label: '会议录音', icon: 'waveform' as const, list: (list ?? []).filter((r) => r.kind !== 'voice') },
    { label: '说过的语音', icon: 'mic' as const, list: (list ?? []).filter((r) => r.kind === 'voice') },
  ].filter((g) => g.list.length)

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <NavBar title="交给我的资料" right={<Pressable hitSlop={8} onPress={() => router.push('/records')} accessibilityLabel="交资料"><Icon name="plus" size={20} color={c.accInk} /></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { load() }} />}>
        <Pressable onPress={() => router.push('/search')} style={s.search}>
          <Icon name="magnifyingglass" size={17} color={c.t3} />
          <Text style={s.searchText}>搜录音里说过的话</Text>
        </Pressable>
        {list == null ? <ActivityIndicator color={c.acc} style={{ marginTop: 32 }} /> : null}
        {groups.map((g, k) => (
          <View key={g.label}>
            <GroupLabel top={k === 0 ? 16 : 24}>{g.label} · {g.list.length}</GroupLabel>
            <Card>{g.list.map((r, n) => (
              <Pressable key={r.id} onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/minutes', params: { id: r.id } }) }} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.raised }]}>
                {n > 0 && <View style={[ui.sep, { left: 50 }]} />}
                <Icon name={g.icon} size={17} color={c.t3} />
                <View style={{ flex: 1 }}>
                  <Text style={s.t} numberOfLines={1}>{r.title || (busy(r) ? '新录音' : '录音')}</Text>
                  <Text style={s.meta}>{[when(r), r.duration_s ? clock(r.duration_s * 1000) : '', r.scene ? sceneLabel[r.scene] : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                {r.status !== 'done' ? <Text style={[s.meta, r.status === 'failed' && { color: c.bad }]}>{statusLabel[r.status]}</Text> : null}
              </Pressable>
            ))}</Card>
          </View>
        ))}
        {list && !list.length ? <View style={s.empty}>
          <Icon name="folder" size={28} color={c.t3} />
          <Text style={s.emptyText}>录一段会议，或导入录音文件给我</Text>
        </View> : null}
        <Text style={s.note}>现在能交的是录音。照片、文档、链接后面再开放。</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  search: { height: 40, borderRadius: 10, backgroundColor: '#E4E4EA', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchText: { fontSize: 17, color: c.t3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56 },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  meta: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48 },
  emptyText: { fontSize: 15, color: c.t3 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 12 },
})

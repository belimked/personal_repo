import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { ActionSheetIOS, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NavBar } from '@/components/NavBar'
import { Card, GroupLabel, Icon, ui } from '@/components/ui'
import type { ApiItem } from '@/lib/api'
import { doneAt, isDone, recordingOf, str, titleOf, weekStart } from '@/lib/items'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

const day = (iso: string) => new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })

/** 历史事情：办完的事，按本周 / 上周 / 更早分组 */
export default function History() {
  const { items, setDone, refreshing, refresh } = useStore()
  const done = items.filter(isDone).sort((a, b) => doneAt(b).localeCompare(doneAt(a)))
  const thisWeek = weekStart().toISOString(), lastWeek = weekStart(-1).toISOString()
  const groups: { label: string; list: ApiItem[] }[] = [
    { label: '本周', list: done.filter((i) => doneAt(i) >= thisWeek) },
    { label: '上周', list: done.filter((i) => doneAt(i) >= lastWeek && doneAt(i) < thisWeek) },
    { label: '更早', list: done.filter((i) => doneAt(i) < lastWeek) },
  ].filter((g) => g.list.length)

  const more = (i: ApiItem) => {
    const acts = [{ text: '还没办完', run: () => setDone(i.id, false) }]
    if (recordingOf(i)) acts.push({ text: '看录音纪要', run: () => router.push({ pathname: '/minutes', params: { id: recordingOf(i) } }) })
    ActionSheetIOS.showActionSheetWithOptions({ title: titleOf(i), options: [...acts.map((a) => a.text), '取消'], cancelButtonIndex: acts.length },
      (n) => { if (n < acts.length) { Haptics.selectionAsync(); acts[n].run() } })
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <NavBar title="历史事情" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} />}>
        {groups.map((g, k) => (
          <View key={g.label}>
            <GroupLabel top={k === 0 ? 8 : 24}>{g.label}办完 {g.list.length} 件</GroupLabel>
            <Card>{g.list.map((i, n) => (
              <Pressable key={i.id} onPress={() => more(i)} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.raised }]}>
                {n > 0 && <View style={[ui.sep, { left: 50 }]} />}
                <Icon name="checkmark.circle.fill" size={20} color={c.ok} />
                <View style={{ flex: 1 }}>
                  <Text style={s.t} numberOfLines={2}>{titleOf(i)}</Text>
                  <Text style={s.meta}>{[day(doneAt(i)), str(i.data.owner), recordingOf(i) ? '来自录音' : ''].filter(Boolean).join(' · ')}</Text>
                </View>
              </Pressable>
            ))}</Card>
          </View>
        ))}
        {!groups.length ? <View style={s.empty}>
          <Icon name="clock.arrow.circlepath" size={28} color={c.t3} />
          <Text style={s.emptyText}>还没有办完的事</Text>
          <Text style={s.note}>在“盯着”里勾掉一件事，它就会出现在这里。</Text>
        </View> : <Text style={s.note}>点一件事可以改回“还没办完”。</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 52 },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  meta: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48 },
  emptyText: { fontSize: 15, color: c.t3 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 12, textAlign: 'center' },
})

import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NavBar } from '@/components/NavBar'
import { Card, GroupLabel, Icon, ui } from '@/components/ui'
import type { ApiItem } from '@/lib/api'
import { dayLabel, dayOf, dueOf, isOpen, recordingOf, str, titleOf } from '@/lib/items'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

/** 日程：过期、今天起两周内到期的事，按天分组；没日期的不在这里（在“盯着”） */
export default function Schedule() {
  const { items, user, setDone, refreshing, refresh } = useStore()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(today); end.setDate(end.getDate() + 14)

  const dated = items.filter(isOpen).map((i) => ({ i, d: dayOf(dueOf(i)) })).filter((x): x is { i: ApiItem; d: Date } => !!x.d && x.d < end)
  const late = dated.filter((x) => x.d < today)
  const days = new Map<number, ApiItem[]>()
  for (const x of dated.filter((x) => x.d >= today).sort((a, b) => a.d.getTime() - b.d.getTime())) {
    days.set(x.d.getTime(), [...(days.get(x.d.getTime()) ?? []), x.i])
  }
  const later = items.filter(isOpen).filter((i) => { const d = dayOf(dueOf(i)); return d && d >= end }).length

  const row = (i: ApiItem, n: number) => {
    const owner = str(i.data.owner)
    const mine = i.kind === 'todo'
    const meta = [i.kind === 'watch' ? (owner && owner !== user?.name ? `等${owner}，到期提醒你` : '我在盯') : owner && owner !== user?.name ? owner : '', recordingOf(i) ? '来自录音' : ''].filter(Boolean).join(' · ')
    return (
      <Pressable key={i.id} onPress={() => { const r = recordingOf(i); if (r) router.push({ pathname: '/minutes', params: { id: r } }) }} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.raised }]}>
        {n > 0 && <View style={[ui.sep, { left: 50 }]} />}
        {mine ? <Pressable hitSlop={10} accessibilityRole="checkbox" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDone(i.id, true) }} style={s.check} />
          : <View style={{ width: 22, alignItems: 'center' }}><Icon name="eye" size={15} color={c.t3} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={s.t} numberOfLines={2}>{titleOf(i)}</Text>
          {meta ? <Text style={s.meta}>{meta}</Text> : null}
        </View>
      </Pressable>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <NavBar title="日程" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} />}>
        {late.length ? <>
          <GroupLabel top={8}><Text style={{ color: c.bad }}>已过期 {late.length} 件</Text></GroupLabel>
          <Card>{late.map((x, n) => row(x.i, n))}</Card>
        </> : null}
        {[...days.entries()].map(([t, list], k) => (
          <View key={t}>
            <GroupLabel top={k === 0 && !late.length ? 8 : 24}>{dayLabel(new Date(t))}</GroupLabel>
            <Card>{list.map(row)}</Card>
          </View>
        ))}
        {!late.length && !days.size ? <View style={s.empty}>
          <Icon name="calendar" size={28} color={c.t3} />
          <Text style={s.emptyText}>两周内没有到期的事</Text>
        </View> : null}
        <Text style={s.note}>只列有日期的事{later ? `；两周以后还有 ${later} 件` : ''}。没定日期的在“盯着”。点圆圈表示办完。</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 52 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.chev },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  meta: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48 },
  emptyText: { fontSize: 15, color: c.t3 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 12 },
})

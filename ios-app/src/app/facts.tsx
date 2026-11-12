import { useState } from 'react'
import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FactRows } from '@/components/FactRows'
import { GroupLabel, Icon } from '@/components/ui'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
export default function Facts() {
  const { items } = useStore()
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const swipe = (phase: 'start' | 'end') => setScrollEnabled(phase === 'end')
  const swipeProps = { openId, setOpenId, onSwipe: swipe }
  const facts = items.filter((i) => i.kind === 'fact' && !i.deleted && typeof i.data.text === 'string')
  return <SafeAreaView edges={['top']} style={{ flex: 1 }}><View style={s.nav}><Pressable onPress={() => router.back()} style={s.back}><Icon name="chevron.left" size={20} color={c.accInk} /><Text style={s.link}>隐私</Text></Pressable><Text style={s.title}>我了解的你</Text><View style={{ width: 80 }} /></View><ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
    <GroupLabel top={16}>还没确认的</GroupLabel><FactRows list={facts.filter((i) => i.data.auto === true && i.data.confirmed !== true)} confirm {...swipeProps} />
    <GroupLabel>已确认的 · 工作</GroupLabel><FactRows list={facts.filter((i) => (i.data.auto !== true || i.data.confirmed === true) && i.data.group !== '健康')} {...swipeProps} />
    <GroupLabel>已确认的 · 健康</GroupLabel><FactRows list={facts.filter((i) => (i.data.auto !== true || i.data.confirmed === true) && i.data.group === '健康')} {...swipeProps} />
  </ScrollView></SafeAreaView>
}
const s = StyleSheet.create({ nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }, back: { flexDirection: 'row', alignItems: 'center', width: 80 }, link: { color: c.accInk, fontSize: 17 }, title: { color: c.t1, fontSize: 17, fontWeight: '500' } })

import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Icon, ui } from '@/components/ui'
import { DEFAULT_SENSITIVE } from './privacy'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
const labels = { health: '健康', finance: '财务', kids: '孩子', location: '位置', face: '人脸' }
export default function Sensitive() {
  const { items, token, setSetting } = useStore()
  const saved = items.find((i) => i.id === 'setting-sensitive' && !i.deleted)?.data.value
  const values = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...DEFAULT_SENSITIVE, ...saved as typeof DEFAULT_SENSITIVE } : DEFAULT_SENSITIVE
  return <SafeAreaView edges={['top']} style={{ flex: 1 }}><View style={s.nav}><Pressable onPress={() => router.back()} style={s.back}><Icon name="chevron.left" size={20} color={c.accInk} /><Text style={s.link}>隐私</Text></Pressable><Text style={s.title}>敏感类别</Text><View style={{ width: 80 }} /></View><ScrollView contentContainerStyle={{ padding: 16 }}><Card>{(Object.keys(labels) as (keyof typeof labels)[]).map((key, n) => <View key={key} style={ui.row}>{n > 0 && <View style={ui.sep} />}<Text style={ui.rowLabel}>{labels[key]}</Text><Switch value={values[key]} onValueChange={(v) => { setSetting('sensitive', { ...values, [key]: v }); if (key === 'location' && !v && token) void api.deleteLocation(token).catch(() => {}) }} trackColor={{ true: c.acc }} /></View>)}</Card><Text style={s.note}>关闭后，小禾不会再记下这类信息。</Text></ScrollView></SafeAreaView>
}
const s = StyleSheet.create({ nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }, back: { flexDirection: 'row', alignItems: 'center', width: 80 }, link: { color: c.accInk, fontSize: 17 }, title: { color: c.t1, fontSize: 17, fontWeight: '500' }, note: { color: c.t3, fontSize: 13, padding: 16 } })

import { File, Paths } from 'expo-file-system'
import { router } from 'expo-router'
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FactRows } from '@/components/FactRows'
import { Card, GroupLabel, Icon, Row, ui } from '@/components/ui'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

export const DEFAULT_SENSITIVE = { health: true, finance: true, kids: true, location: true, face: false }
export default function Privacy() {
  const { items, token, refresh, generalMode, setGeneralMode } = useStore()
  const facts = items.filter((i) => i.kind === 'fact' && !i.deleted && typeof i.data.text === 'string' && (i.data.auto !== true || i.data.confirmed === true))
  const value = items.find((i) => i.id === 'setting-sensitive' && !i.deleted)?.data.value
  const sensitive = value && typeof value === 'object' && !Array.isArray(value) ? { ...DEFAULT_SENSITIVE, ...value as typeof DEFAULT_SENSITIVE } : DEFAULT_SENSITIVE
  const exportAll = async () => {
    if (!token) return
    try {
      const data = await api.exportData(token)
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const file = new File(Paths.cache, `xiaohe-export-${date}.json`)
      file.write(data)
      await Share.share({ url: file.uri, message: file.uri })
    } catch (e) { Alert.alert('导出失败', e instanceof Error ? e.message : '请稍后再试') }
  }
  const forget = () => Alert.alert('忘掉我？', '会删掉我记下的所有关于你的信息，不能恢复。', [
    { text: '取消', style: 'cancel' }, { text: '继续', style: 'destructive', onPress: () => Alert.alert('最后确认', '确定忘掉我了解的你？', [
      { text: '取消', style: 'cancel' }, { text: '忘掉', style: 'destructive', onPress: () => { if (token) void api.forget(token).then(() => refresh()).catch((e) => Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后再试')) } },
    ]) },
  ])
  return <SafeAreaView edges={['top']} style={{ flex: 1 }}>
    <View style={s.nav}><Pressable onPress={() => router.back()} style={s.back}><Icon name="chevron.left" size={20} color={c.accInk} /><Text style={{ fontSize: 17, color: c.accInk }}>我的</Text></Pressable><Text style={s.mid}>隐私与个人信息</Text><View style={{ width: 80 }} /></View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
      <GroupLabel top={16}>我了解的你：工作</GroupLabel><FactRows list={facts.filter((f) => f.data.group !== '健康')} />
      <GroupLabel>健康</GroupLabel><FactRows list={facts.filter((f) => f.data.group === '健康')} />
      <Text style={s.note}>这些是我为了把事办好而记下的，左滑可删掉。 <Text style={{ color: c.accInk }} onPress={() => router.push('/facts')}>查看全部，含还没确认的</Text></Text>
      <GroupLabel>不按你的情况定制</GroupLabel><Card><View style={ui.row}><Text style={ui.rowLabel}>通用模式</Text><Switch value={generalMode} onValueChange={setGeneralMode} trackColor={{ true: c.acc }} /></View><Row label="敏感类别" value={`${Object.values(sensitive).filter(Boolean).length} 项开`} onPress={() => router.push('/sensitive')} /></Card>
      <Text style={s.note}>健康、财务、孩子、位置、人脸</Text>
      <GroupLabel>客服查看记录</GroupLabel><Card><Row first label="没有授权" chevron={false} /></Card><Text style={s.note}>除非你授权，我们的工作人员看不到你的记录</Text>
      <Card style={{ marginTop: 32 }}><Row first label="导出全部数据" labelColor={c.accInk} chevron={false} onPress={() => { void exportAll() }} /><Row label="忘掉我" labelColor={c.bad} chevron={false} onPress={forget} /></Card>
    </ScrollView>
  </SafeAreaView>
}
const s = StyleSheet.create({ nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }, back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, width: 80 }, mid: { fontSize: 17, fontWeight: '500', color: c.t1 }, note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 8 } })

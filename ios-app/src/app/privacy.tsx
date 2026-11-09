import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, GroupLabel, Icon, Row, ui } from '@/components/ui'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
import type { Fact } from '@/lib/data'

/** 06 隐私与个人信息 */
export default function Privacy() {
  const { facts, removeFact, generalMode, setGeneralMode } = useStore()
  const work = facts.filter((f) => f.group === '工作')
  const health = facts.filter((f) => f.group === '健康')
  const wrong = (f: Fact) => Alert.alert('删掉这条？', f.text, [
    { text: '取消', style: 'cancel' },
    { text: '删掉', style: 'destructive', onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); removeFact(f.id) } },
  ])
  const group = (list: Fact[]) => list.length === 0
    ? <Card><Row first label="没有记下的" chevron={false} labelColor={c.t3} /></Card>
    : <Card>{list.map((f, i) => (
        <View key={f.id} style={s.fact}>
          {i > 0 && <View style={ui.sep} />}
          <View style={{ flex: 1 }}>
            <Text style={s.t}>{f.text}</Text>
            <View style={ui.src}><Icon name="doc.text" size={13} color={c.t3} /><Text style={ui.srcText}>{f.from}</Text></View>
          </View>
          <Pressable onPress={() => wrong(f)} hitSlop={8}><Text style={s.no}>不对</Text></Pressable>
        </View>
      ))}</Card>

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Icon name="chevron.left" size={20} color={c.accInk} weight="semibold" />
          <Text style={{ fontSize: 17, color: c.accInk }}>我的</Text>
        </Pressable>
        <Text style={s.mid}>隐私与个人信息</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
        <GroupLabel top={16}>我了解的你：工作</GroupLabel>
        {group(work)}
        <GroupLabel>健康</GroupLabel>
        {group(health)}
        <Text style={s.note}>这些是我为了把事办好而记下的，点“不对”可删掉。<Text style={{ color: c.accInk }} onPress={() => Alert.alert('全部记录', '原型里先不展开。')}>查看全部，含还没确认的</Text></Text>

        <GroupLabel>不按你的情况定制</GroupLabel>
        <Card>
          <View style={[ui.row]}>
            <Text style={ui.rowLabel}>通用模式</Text>
            <Switch value={generalMode} onValueChange={setGeneralMode} trackColor={{ true: c.acc }} />
          </View>
          <Row label="敏感类别" value="4 项开" onPress={() => Alert.alert('敏感类别', '健康、财务、孩子、位置、人脸')} />
        </Card>
        <Text style={s.note}>健康、财务、孩子、位置、人脸</Text>

        <GroupLabel>客服查看记录</GroupLabel>
        <Card><Row first label="没有授权" chevron={false} /></Card>
        <Text style={s.note}>除非你授权，我们的工作人员看不到你的记录</Text>

        <Card style={{ marginTop: 32 }}>
          <Row first label="导出全部数据" labelColor={c.accInk} chevron={false} onPress={() => Alert.alert('导出全部数据', '整理好后发到 luhang@company.com。')} />
          <Row label="忘掉我" labelColor={c.bad} chevron={false} onPress={() => Alert.alert('忘掉我？', '会删掉我记下的所有关于你的信息，不能恢复。', [{ text: '取消', style: 'cancel' }, { text: '忘掉', style: 'destructive' }])} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, width: 80 },
  mid: { fontSize: 17, fontWeight: '500', color: c.t1 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  no: { fontSize: 15, lineHeight: 24, color: c.accInk, paddingHorizontal: 4 },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 8 },
})

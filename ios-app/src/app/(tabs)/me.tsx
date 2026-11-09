import { router } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Chev, GroupLabel, Row, ui } from '@/components/ui'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

/** 05 我的 */
export default function Me() {
  const { reset, logout, user, demo } = useStore()
  const soon = (t: string) => Alert.alert(t, '原型里这一页还没做。')
  const general = () => Alert.alert('通用', undefined, [
    { text: '重置演示数据', style: 'destructive', onPress: () => { reset(); router.navigate('/') } },
    { text: '取消', style: 'cancel' },
  ])
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16 }}><Text style={ui.title}>我的</Text></View>

        <Pressable onPress={() => soon('个人资料')} style={({ pressed }) => [ui.card, s.me, pressed && { backgroundColor: c.raised }]}>
          <View style={s.avatar}><Text style={s.avatarText}>{user?.name?.slice(0, 1) ?? '陆'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.n}>{user?.name ?? '陆航'}</Text>
            <Text style={s.e}>{user?.email ?? 'luhang@company.com'}</Text>
          </View>
          <Chev />
        </Pressable>

        <Card style={{ marginTop: 24 }}>
          <Row first label="会员与点数" value="本月剩 320 点" onPress={() => soon('会员与点数')} />
        </Card>

        <GroupLabel>设置</GroupLabel>
        <Card>
          <Row first label="主动服务" value="开" onPress={() => soon('主动服务')} />
          <Row label="工作邮箱" value="已接入，只读" onPress={() => soon('工作邮箱')} />
          <Row label="通知" value="只发错过就晚的" onPress={() => soon('通知')} />
          <Row label="通用" onPress={general} />
        </Card>

        <Card style={{ marginTop: 24 }}>
          <Row first label="隐私与个人信息" onPress={() => router.push('/privacy')} />
        </Card>
        <Card style={{ marginTop: 24 }}>
          <Row first label={demo ? '退出演示' : '退出登录'} labelColor={c.bad} chevron={false} onPress={() => { void logout() }} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accTint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.accInk, fontSize: 22, fontWeight: '500' },
  n: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: c.t1 },
  e: { fontSize: 13, lineHeight: 18, color: c.t3 },
})

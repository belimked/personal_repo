import Constants from 'expo-constants'
import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { showSheet } from '@/components/Sheet'
import { Card, Chev, GroupLabel, Row, ui } from '@/components/ui'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

const PROACTIVE = [
  { value: 'on', label: '开', note: '备好的事会通知你' },
  { value: 'quiet', label: '只准备不通知', note: '备好放进简报，不推送' },
  { value: 'off', label: '关', note: '只在你开口时做事，你让我提醒的照常提醒' },
] as const
const NOTIFY = [{ value: 'all', label: '全部' }, { value: 'urgent', label: '只发错过就晚的' }, { value: 'off', label: '关' }] as const

export default function Me() {
  const { reset, logout, user, demo, token, items, setSetting } = useStore()
  const [permission, setPermission] = useState(false)
  const [points, setPoints] = useState<Awaited<ReturnType<typeof api.points>> | null>(null)
  useFocusEffect(useCallback(() => {
    let alive = true
    void Notifications.getPermissionsAsync().then((p) => { if (alive) setPermission(p.granted) }).catch(() => {})
    if (token) void api.points(token).then((r) => { if (alive) setPoints(r) }).catch(() => {})
    return () => { alive = false }
  }, [token]))
  const setting = (key: string) => items.find((i) => i.id === `setting-${key}` && !i.deleted)?.data.value
  const proactive = PROACTIVE.find((p) => p.value === setting('proactive')) ?? PROACTIVE[0]
  const notify = NOTIFY.find((p) => p.value === setting('notify')) ?? NOTIFY[0]
  const pickProactive = () => showSheet({ title: '主动服务', message: PROACTIVE.map((p) => `${p.label}：${p.note}`).join('\n'), options: [...PROACTIVE.map((p) => p.label), '取消'], cancelButtonIndex: PROACTIVE.length }, (n) => { if (n < PROACTIVE.length) { void Haptics.selectionAsync(); setSetting('proactive', PROACTIVE[n].value) } })
  const openNotify = () => {
    if (!permission) { Alert.alert('系统已关闭通知', '请先去系统设置打开通知。', [{ text: '取消', style: 'cancel' }, { text: '去设置', onPress: () => { void Linking.openSettings() } }]); return }
    showSheet({ title: '通知', options: [...NOTIFY.map((p) => p.label), '取消'], cancelButtonIndex: NOTIFY.length }, (n) => { if (n < NOTIFY.length) setSetting('notify', NOTIFY[n].value) })
  }
  const quit = () => Alert.alert(demo ? '退出演示？' : '退出登录？', demo ? undefined : '退出后这台手机不再收到通知。', [{ text: '取消', style: 'cancel' }, { text: '退出', style: 'destructive', onPress: () => { void logout() } }])
  const profile = () => Alert.alert('账号信息', [user?.name, user?.email, '名字和邮箱由管理员设置，需要改请联系管理员。'].filter(Boolean).join('\n'), [{ text: '退出登录', style: 'destructive', onPress: quit }, { text: '好' }])
  const general = () => showSheet({ title: '通用', options: ['录音', '清除本机缓存并重新同步', '退出登录', '取消'], cancelButtonIndex: 3, destructiveButtonIndex: 2 }, (n) => { if (n === 0) router.push('/records'); if (n === 1) { reset(); router.navigate('/') } if (n === 2) quit() })
  const showPoints = () => Alert.alert('会员与点数', points ? `${points.month} 用量\n${points.detail.map((d) => `${d.label}：${d.count} 次，${d.points} 点`).join('\n')}\n已用 ${points.used} / ${points.quota} 点\n内测期间不扣费` : '点数暂时无法获取，请稍后再试。')
  return <SafeAreaView edges={['top']} style={{ flex: 1 }}><ScrollView contentContainerStyle={s.body}>
    <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16 }}><Text style={ui.title}>我的</Text></View>
    <Pressable onPress={profile} style={({ pressed }) => [ui.card, s.me, pressed && { backgroundColor: c.raised }]}><View style={s.avatar}><Text style={s.avatarText}>{user?.name?.slice(0, 1) ?? '陆'}</Text></View><View style={{ flex: 1 }}><Text style={s.n}>{user?.name ?? '陆航'}</Text><Text style={s.e}>{user?.email ?? '演示账号'}</Text></View><Chev /></Pressable>
    <Card style={{ marginTop: 24 }}><Row first label="会员与点数" value={points ? `本月剩 ${points.left} 点` : '—'} onPress={showPoints} /></Card>
    <GroupLabel>设置</GroupLabel><Card>
      <Row first label="主动服务" value={proactive.label} onPress={demo ? undefined : pickProactive} />
      <Row label="工作邮箱" value="未接入" onPress={() => Alert.alert('工作邮箱', '接入工作邮箱还在开发')} />
      <Row label="通知" value={permission ? notify.label : '系统已关闭'} onPress={openNotify} />
      <Row label="通用" onPress={general} />
    </Card>
    <Card style={{ marginTop: 24 }}><Row first label="隐私与个人信息" onPress={() => router.push('/privacy')} /><Row label="聊天记录" onPress={demo ? undefined : () => router.push('/chats')} /></Card>
    <View style={{ flex: 1 }} /><Text style={s.version}>小禾 {Constants.expoConfig?.version ?? ''}（{Constants.expoConfig?.ios?.buildNumber ?? '-'}）</Text>
  </ScrollView></SafeAreaView>
}
const s = StyleSheet.create({
  body: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accTint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.accInk, fontSize: 22, fontWeight: '500' },
  n: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: c.t1 }, e: { fontSize: 13, lineHeight: 18, color: c.t3 },
  version: { fontSize: 12, color: c.t3, textAlign: 'center', paddingTop: 16 },
})

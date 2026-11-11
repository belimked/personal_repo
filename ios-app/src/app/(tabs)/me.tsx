import Constants from 'expo-constants'
import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActionSheetIOS, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Chev, GroupLabel, Icon, Row, ui, type SfName } from '@/components/ui'
import { api } from '@/lib/api'
import { registerPush } from '@/lib/push'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

const PROACTIVE = [
  { value: 'on', label: '开', note: '备好的事会通知你' },
  { value: 'quiet', label: '只准备不通知', note: '备好放进简报，不推送' },
  { value: 'off', label: '关', note: '只在你开口时做事，你让我提醒的照常提醒' },
] as const

const icon = (name: SfName, bg: string) => <View style={[s.ic, { backgroundColor: bg }]}><Icon name={name} size={16} color="#fff" /></View>

/** 05 我的：账号、录音、设置、隐私 */
export default function Me() {
  const { reset, logout, user, demo, token, items, setSetting } = useStore()
  const [notify, setNotify] = useState<'on' | 'off' | 'ask' | null>(null)
  const [recCount, setRecCount] = useState<{ total: number; busy: number } | null>(null)

  // 每次回到这一页刷新通知权限和录音数
  useFocusEffect(useCallback(() => {
    let alive = true
    void Notifications.getPermissionsAsync().then((p) => { if (alive) setNotify(p.granted ? 'on' : p.canAskAgain ? 'ask' : 'off') }).catch(() => {})
    if (token) void api.recordings(token).then((r) => {
      if (alive) setRecCount({ total: r.recordings.length, busy: r.recordings.filter((x) => x.status === 'queued' || x.status === 'transcribing' || x.status === 'summarizing').length })
    }).catch(() => {})
    return () => { alive = false }
  }, [token]))

  const setting = (key: string) => items.find((i) => i.id === `setting-${key}` && !i.deleted)?.data.value
  const proactive = PROACTIVE.find((p) => p.value === setting('proactive')) ?? PROACTIVE[0]
  const version = `${Constants.expoConfig?.version ?? ''}（${Constants.expoConfig?.ios?.buildNumber ?? '-'}）`

  const pickProactive = () => ActionSheetIOS.showActionSheetWithOptions({
    title: '主动服务', message: PROACTIVE.map((p) => `${p.label}：${p.note}`).join('\n'),
    options: [...PROACTIVE.map((p) => (p.value === proactive.value ? '✓ ' : '') + p.label), '取消'], cancelButtonIndex: PROACTIVE.length,
  }, (n) => { if (n < PROACTIVE.length) { Haptics.selectionAsync(); setSetting('proactive', PROACTIVE[n].value) } })

  const openNotify = async () => {
    if (notify === 'ask' && token) {
      await registerPush(token)
      const p = await Notifications.getPermissionsAsync()
      setNotify(p.granted ? 'on' : 'off')
      return
    }
    Alert.alert(notify === 'on' ? '通知已开启' : '通知已关闭',
      notify === 'on' ? '录音整理好、小禾回复你时会通知。要关掉，去系统设置。' : '去系统设置打开通知，录音整理好时才能提醒你。',
      [{ text: '取消', style: 'cancel' }, { text: '去设置', onPress: () => { void Linking.openSettings() } }])
  }
  const profile = () => Alert.alert(user?.name ?? '演示账号', [user?.email, '名字和邮箱由管理员设置，需要改请联系管理员。'].filter(Boolean).join('\n\n'))
  const general = () => Alert.alert('通用', undefined, [
    { text: '清除本机缓存并重新同步', onPress: () => { reset(); router.navigate('/') } },
    { text: '取消', style: 'cancel' },
  ])
  const quit = () => Alert.alert(demo ? '退出演示？' : '退出登录？', demo ? undefined : '退出后这台手机不再收到通知。', [
    { text: '取消', style: 'cancel' }, { text: '退出', style: 'destructive', onPress: () => { void logout() } },
  ])

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16 }}><Text style={ui.title}>我的</Text></View>

        <Pressable onPress={profile} style={({ pressed }) => [ui.card, s.me, pressed && { backgroundColor: c.raised }]}>
          <View style={s.avatar}><Text style={s.avatarText}>{user?.name?.slice(0, 1) ?? '陆'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.n}>{user?.name ?? '陆航'}</Text>
            <Text style={s.e}>{user?.email ?? '演示账号'}</Text>
          </View>
          <Chev />
        </Pressable>

        <Card style={{ marginTop: 24 }}>
          <Row first left={icon('waveform', c.acc)} label="录音" value={demo ? '登录后可用' : recCount == null ? '' : recCount.busy ? `${recCount.busy} 段在处理` : `${recCount.total} 段`}
            onPress={demo ? undefined : () => router.push('/records')} />
        </Card>
        <Text style={s.foot}>录会议、导入录音文件，看转写原文和纪要。</Text>

        <GroupLabel>设置</GroupLabel>
        <Card>
          <Row first left={icon('sparkles', '#5E5CE6')} label="主动服务" value={proactive.label} onPress={demo ? undefined : pickProactive} />
          <Row left={icon('bell.fill', '#FF3B30')} label="通知" value={notify === 'on' ? '已开启' : notify === 'ask' ? '未开启' : notify === 'off' ? '已关闭' : ''} onPress={() => { void openNotify() }} />
          <Row left={icon('envelope.fill', '#0A84FF')} label="工作邮箱" value="暂未开放" chevron={false} />
          <Row left={icon('gearshape.fill', '#8E8E93')} label="通用" onPress={general} />
        </Card>
        <Text style={s.foot}>{proactive.note}。</Text>

        <Card style={{ marginTop: 24 }}>
          <Row first left={icon('hand.raised.fill', '#34C759')} label="隐私与个人信息" onPress={() => router.push('/privacy')} />
          <Row left={icon('creditcard.fill', '#FF9500')} label="会员与点数" value="内测免费" chevron={false} />
        </Card>

        <Card style={{ marginTop: 24 }}>
          <Row first label={demo ? '退出演示' : '退出登录'} labelColor={c.bad} chevron={false} onPress={quit} />
        </Card>
        <Text style={[s.foot, { textAlign: 'center', paddingTop: 16 }]}>小禾 {version}</Text>
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
  ic: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  foot: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 8 },
})

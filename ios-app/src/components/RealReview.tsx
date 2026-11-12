import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, Alert, Animated, Dimensions, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from '@/lib/api'
import { dueOf, recordingOf, str, titleOf, when } from '@/lib/items'
import { sceneLabel } from '@/lib/recorder'
import { useStore, type Outcome } from '@/lib/store'
import { c } from '@/lib/theme'
import { briefQueue } from './Brief'
import { Button, Icon, ui } from './ui'

export function RealReview() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { items, user, token, outcomes, moveItem, remindItem, deleteItem, recordOutcome } = useStore()
  const [skipped, setSkipped] = useState<string[]>([])
  const [handled, setHandled] = useState(0)
  const [initial, setInitial] = useState<string[]>([])
  const available = briefQueue(items)
  const order = initial.length ? initial : available.map((i) => i.id)
  const queue = available.filter((i) => !skipped.includes(i.id) && !(i.id in outcomes)).sort((a, b) => Number(b.id === id) - Number(a.id === id))
  const item = queue[0]
  const [source, setSource] = useState<{ id: string; title: string } | null>(null)
  const [x] = useState(() => new Animated.Value(0))
  const rec = item ? recordingOf(item) : ''
  useEffect(() => {
    if (!token || !rec) return
    let active = true
    void api.recording(token, rec).then((r) => { if (active) setSource({ id: rec, title: r.recording.title || '录音或资料的整理' }) }).catch(() => {})
    return () => { active = false }
  }, [token, rec])
  const back = () => router.canGoBack() ? router.back() : router.replace('/')
  const finish = (result: Outcome['result'], remind?: string) => {
    if (!item) return
    if (!initial.length) setInitial(available.map((i) => i.id))
    recordOutcome(item.id, { title: titleOf(item), result, remind })
    setHandled((n) => n + 1)
    if (result === 'later') setSkipped((p) => [...p, item.id])
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    x.setValue(0)
    if (queue.length === 1) back()
  }
  const later = () => {
    if (!item) return
    const now = new Date(), remind = new Date(now)
    if (now.getHours() > 17 || (now.getHours() === 17 && now.getMinutes() >= 30)) { remind.setDate(remind.getDate() + 1); remind.setHours(9, 0, 0, 0) }
    else remind.setHours(17, 30, 0, 0)
    remindItem(item.id, remind.toISOString()); finish('later', remind.toISOString())
  }
  const laterRef = useRef(later)
  useEffect(() => { laterRef.current = later })
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(Math.max(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx > 120 || g.vx > 0.8) Animated.timing(x, { toValue: Dimensions.get('window').width, duration: 180, useNativeDriver: true }).start(() => laterRef.current())
      else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start()
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  }))
  const action = (result: Outcome['result']) => {
    if (!item) return
    if (result === 'drop') deleteItem(item.id)
    else moveItem(item.id, result === 'watch' ? 'watch' : 'todo', { done: false, state: null, ...(result === 'mine' ? { owner: user?.name ?? '' } : {}) })
    finish(result)
  }
  const editTime = () => Alert.prompt('改时间', '请输入 MM-DD', [
    { text: '取消', style: 'cancel' },
    { text: '保存', onPress: (value?: string) => {
      const match = /^(\d{1,2})-(\d{1,2})$/.exec(value?.trim() ?? '')
      const month = Number(match?.[1]), day = Number(match?.[2]); const date = new Date(new Date().getFullYear(), month - 1, day)
      if (!match || date.getMonth() !== month - 1 || date.getDate() !== day) { Alert.alert('日期不对', '请按 MM-DD 输入'); return }
      if (date < new Date(new Date().setHours(0, 0, 0, 0))) date.setFullYear(date.getFullYear() + 1)
      moveItem(item.id, item.kind === 'todo' ? 'todo' : 'idea', { due: `${date.getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` })
    } },
  ], 'plain-text')
  const edit = () => ActionSheetIOS.showActionSheetWithOptions({ title: '改一改', options: ['安排成待办', '交给小禾盯着', '我自己办', '改时间', '取消'], cancelButtonIndex: 4 }, (n) => {
    if (n === 0) action('todo'); if (n === 1) action('watch'); if (n === 2) action('mine'); if (n === 3) editTime()
  })
  if (!item) return <SafeAreaView style={{ flex: 1 }}><Button title="返回简报" onPress={back} /></SafeAreaView>
  const owner = str(item.data.owner)
  const reminder = str(item.data.remind_at)
  const due = when(dueOf(item))
  const facts = [
    { k: '类别', v: sceneLabel[str(item.data.scene)] ?? '' }, { k: '谁来办', v: owner === user?.name ? '你' : owner },
    { k: '时间', v: due.text }, { k: '备注', v: str(item.data.note) },
    { k: '提醒', v: reminder ? when(reminder).text : '' },
  ].filter((f) => f.v)
  const stash = x.interpolate({ inputRange: [0, 120], outputRange: [0, 1], extrapolate: 'clamp' })
  return <SafeAreaView style={{ flex: 1 }}>
    <View style={s.nav}><Pressable onPress={back} style={s.back}><Icon name="chevron.left" size={20} color={c.accInk} /><Text style={s.navText}>简报</Text></Pressable>
      <Text style={s.mid}>{handled + 1} / {order.length || queue.length}</Text>
      <Pressable onPress={later} style={s.end}><Text style={s.navText}>稍后</Text></Pressable></View>
    <View style={s.progress}>{order.map((key) => <View key={key} style={[s.bar, (key === item.id || key in outcomes || !available.some((i) => i.id === key) || skipped.includes(key)) && { backgroundColor: c.acc }]} />)}</View>
    <ScrollView contentContainerStyle={s.body}>
      <View><Animated.View style={[s.stashBg, { opacity: stash }]}><Icon name="clock" size={18} color={c.accInk} /><Text style={{ color: c.accInk }}>暂存，稍后再提醒</Text></Animated.View>
        <Animated.View {...pan.panHandlers} style={[ui.card, s.task, { transform: [{ translateX: x }] }]}>
          <Text style={s.h2}>{titleOf(item)}</Text>
          {facts.length ? <View style={{ marginTop: 16, gap: 12 }}>{facts.map((f) => <View key={f.k} style={{ flexDirection: 'row', gap: 12 }}><Text style={s.k}>{f.k}</Text><Text style={[s.v, f.k === '时间' && due.late && { color: c.bad }]}>{f.v}</Text></View>)}</View> : null}
          <View style={s.reply}><Text style={s.replyK}>建议</Text><Text style={s.replyP}>{str(item.data.suggest) || '小禾还在想办法，先按你的判断定'}</Text></View>
          <View style={s.foot}><Pressable onPress={rec ? () => router.push({ pathname: '/minutes', params: { id: rec } }) : undefined} style={ui.src}>
            <Icon name="doc.text" size={13} color={c.accInk} /><Text style={[ui.srcText, { color: c.accInk }]} numberOfLines={1}>出处：{rec ? source?.id === rec ? source.title : '录音或资料的整理' : '你记下的事'}</Text></Pressable><Text style={ui.srcText}>内容由 AI 生成</Text></View>
        </Animated.View></View>
      <View style={s.hint}><Icon name="arrow.right" size={14} color={c.t3} /><Text style={ui.srcText}>右滑可暂存，稍后再处理</Text></View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', paddingTop: 16, paddingBottom: 12 }}><Button title={owner && owner !== user?.name ? '交给小禾盯着' : '安排成待办'} onPress={() => action(owner && owner !== user?.name ? 'watch' : 'todo')} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}><Button kind="text" title="改一改" onPress={edit} /><Button kind="text" title="这不算问题" onPress={() => action('drop')} /></View>
    </ScrollView>
  </SafeAreaView>
}
const s = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, minWidth: 80 },
  end: { height: 44, minWidth: 80, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 },
  navText: { fontSize: 17, color: c.accInk }, mid: { fontSize: 17, color: c.t1, fontVariant: ['tabular-nums'] },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }, bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#DEDEE3' },
  body: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 8 }, task: { padding: 20 },
  stashBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: c.accTint, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20 },
  h2: { fontSize: 22, lineHeight: 30, fontWeight: '500', color: c.t1 }, k: { width: 56, color: c.t3, fontSize: 13, lineHeight: 22 }, v: { flex: 1, fontSize: 15, lineHeight: 22, color: c.t1 },
  reply: { marginTop: 20, backgroundColor: c.accTint, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 }, replyK: { fontSize: 13, lineHeight: 18, color: c.accInk }, replyP: { fontSize: 15, lineHeight: 22, marginTop: 4, color: c.t1 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 16 },
})

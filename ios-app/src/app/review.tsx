import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Dimensions, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { RealReview } from '@/components/RealReview'
import { Button, Icon, ui } from '@/components/ui'
import { BRIEF_ITEMS, type ItemState } from '@/lib/data'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

/** 02 逐件过：登录后过真实的待确认事项；演示模式用演示简报 */
export default function Review() {
  const { token } = useStore()
  return token ? <RealReview /> : <DemoReview />
}

/** 演示：一次一件，确认 / 改一改 / 不算问题；右滑或“稍后”暂存 */
function DemoReview() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { states, setState, replies, setReply } = useStore()
  const queue = BRIEF_ITEMS.filter((i) => states[i.id] === 'pending' || i.id === id)
  const [cur, setCur] = useState(() => Math.max(0, queue.findIndex((i) => (id ? i.id === id : true))))
  const item = queue[cur] ?? BRIEF_ITEMS.find((i) => states[i.id] === 'pending')
  const [x] = useState(() => new Animated.Value(0))

  const next = (st: ItemState) => {
    if (!item) return
    Haptics.notificationAsync(st === 'done' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning)
    setState(item.id, st)
    const rest = BRIEF_ITEMS.filter((i) => i.id !== item.id && states[i.id] === 'pending')
    x.setValue(0)
    if (rest.length === 0) { router.back(); return }
    const nIdx = queue.findIndex((q) => q.id === rest[0].id)
    setCur(nIdx >= 0 ? nIdx : 0)
  }
  const nextRef = useRef(next)
  useEffect(() => { nextRef.current = next })

  // 手势回调只在触摸事件里读 nextRef，不在渲染时读；编译器规则看不出来，这里单独关掉
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(Math.max(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx > 120 || g.vx > 0.8) Animated.timing(x, { toValue: Dimensions.get('window').width, duration: 180, useNativeDriver: true }).start(() => nextRef.current('later'))
      else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start()
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  }))

  if (!item) return null
  const pos = BRIEF_ITEMS.findIndex((i) => i.id === item.id)
  const reply = replies[item.id] ?? item.reply
  const edit = () => Alert.prompt('改一改', undefined, [{ text: '取消', style: 'cancel' }, { text: '保存', onPress: (t?: string) => { if (t?.trim()) setReply(item.id, t.trim()) } }], 'plain-text', reply)
  const stash = x.interpolate({ inputRange: [0, 120], outputRange: [0, 1], extrapolate: 'clamp' })

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Icon name="chevron.left" size={20} color={c.accInk} weight="semibold" />
          <Text style={s.navText}>简报</Text>
        </Pressable>
        <Text style={s.mid}>{pos + 1} / {BRIEF_ITEMS.length}</Text>
        <Pressable onPress={() => next('later')} hitSlop={8} style={s.end}><Text style={s.navText}>稍后</Text></Pressable>
      </View>
      <View style={s.progress}>
        {BRIEF_ITEMS.map((i, k) => <View key={i.id} style={[s.bar, (k <= pos || states[i.id] !== 'pending') && { backgroundColor: c.acc }]} />)}
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <View>
          <Animated.View style={[s.stashBg, { opacity: stash }]}>
            <Icon name="clock" size={18} color={c.accInk} />
            <Text style={{ color: c.accInk, fontSize: 15 }}>暂存，17:30 再提醒</Text>
          </Animated.View>
          <Animated.View {...pan.panHandlers} style={[ui.card, s.task, { transform: [{ translateX: x }] }]}>
            <Text style={s.h2}>{item.heading}</Text>
            <View style={{ marginTop: 16, gap: 12 }}>
              {item.diffs.map((d) => (
                <View key={d.k} style={{ flexDirection: 'row', gap: 12 }}>
                  <Text style={s.k}>{d.k}</Text>
                  <Text style={s.v}>{d.text}{d.strong ? <Text style={{ fontWeight: '600' }}>{d.strong}</Text> : null}{d.after ?? ''}</Text>
                </View>
              ))}
            </View>
            <View style={s.reply}>
              <Text style={s.replyK}>{item.replyLabel}</Text>
              <Text style={s.replyP}>{reply}</Text>
            </View>
            <View style={s.foot}>
              <Pressable style={ui.src} onPress={() => Alert.alert(item.source.replace('出处：', ''), '原型里先不展开原文。')}>
                <Icon name="doc.text" size={13} color={c.accInk} />
                <Text style={[ui.srcText, { color: c.accInk }]}>{item.source}</Text>
              </Pressable>
              <Text style={ui.srcText}>内容由 AI 生成</Text>
            </View>
          </Animated.View>
        </View>
        <View style={s.hint}>
          <Icon name="arrow.right" size={14} color={c.t3} />
          <Text style={ui.srcText}>右滑可暂存，稍后再处理</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', paddingTop: 16, paddingBottom: 12 }}>
          <Button title={item.confirm} onPress={() => next('done')} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Button kind="text" title="改一改" onPress={edit} />
          <Button kind="text" title="这不算问题" onPress={() => next('done')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, minWidth: 80 },
  end: { height: 44, minWidth: 80, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 },
  navText: { fontSize: 17, color: c.accInk },
  mid: { fontSize: 17, fontWeight: '500', color: c.t1, fontVariant: ['tabular-nums'] },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#DEDEE3' },
  body: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 8 },
  task: { padding: 20 },
  stashBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: c.accTint, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20 },
  h2: { fontSize: 22, lineHeight: 30, fontWeight: '500', color: c.t1 },
  k: { width: 56, color: c.t3, fontSize: 13, lineHeight: 22 },
  v: { flex: 1, fontSize: 15, lineHeight: 22, color: c.t1 },
  reply: { marginTop: 20, backgroundColor: c.accTint, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 },
  replyK: { fontSize: 13, lineHeight: 18, color: c.accInk },
  replyP: { fontSize: 15, lineHeight: 22, marginTop: 4, color: c.t1 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 16 },
})

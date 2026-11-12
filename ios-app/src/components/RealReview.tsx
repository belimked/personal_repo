import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { dueOf, recordingOf, str, titleOf, when } from '@/lib/items'
import { sceneLabel } from '@/lib/recorder'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
import { needsConfirm } from './Brief'
import { Button, Icon, ui } from './ui'

/** 02 逐件过（登录后）：把等你确认的事一件件定下来 —— 安排成待办 / 交给小禾盯着 / 不用了 / 稍后 */
export function RealReview() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { items, user, moveItem, remindItem, deleteItem } = useStore()
  const [skipped, setSkipped] = useState<string[]>([])
  const [handled, setHandled] = useState(0)
  const queue = items.filter((i) => needsConfirm(i) && !skipped.includes(i.id))
    .sort((a, b) => Number(b.id === id) - Number(a.id === id))
  const item = queue[0]
  const back = () => router.canGoBack() ? router.back() : router.replace('/')
  const later = () => {
    const now = new Date()
    const remind = new Date(now)
    if (now.getHours() >= 17) { remind.setDate(remind.getDate() + 1); remind.setHours(9, 0, 0, 0) }
    else remind.setHours(17, 30, 0, 0)
    remindItem(item.id, remind.toISOString())
    Haptics.selectionAsync(); setSkipped((p) => [...p, item.id])
  }

  const act = (run: () => void, ok = true) => {
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning)
    run()
    setHandled((n) => n + 1)
  }

  const nav = (mid: string, right?: React.ReactNode) => (
    <View style={s.nav}>
      <Pressable onPress={back} hitSlop={8} style={s.back}>
        <Icon name="chevron.left" size={20} color={c.accInk} weight="semibold" />
        <Text style={s.navText}>管家</Text>
      </Pressable>
      <Text style={s.mid}>{mid}</Text>
      <View style={s.end}>{right}</View>
    </View>
  )

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        {nav('')}
        <View style={s.finished}>
          <View style={s.done}><Icon name="checkmark" size={22} color={c.ok} weight="semibold" /></View>
          <Text style={[ui.title, { marginTop: 16 }]}>{handled || skipped.length ? '都过完了' : '没有等你定的事'}</Text>
          <Text style={[ui.lede, { textAlign: 'center' }]}>
            {handled ? `定了 ${handled} 件` : ''}{handled && skipped.length ? '，' : ''}{skipped.length ? `${skipped.length} 件留着稍后再看` : ''}
            {!handled && !skipped.length ? '录音和资料里提到、还没安排的事会出现在这里' : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16 }}><Button title="好" onPress={back} /></View>
      </SafeAreaView>
    )
  }

  const rec = recordingOf(item)
  const due = when(dueOf(item))
  const owner = str(item.data.owner)
  const reminder = typeof item.data.remind_at === 'string' ? new Date(item.data.remind_at) : null
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const reminderText = reminder ? `${reminder.toDateString() === new Date().toDateString() ? '' : reminder.toDateString() === tomorrow.toDateString() ? '明天 ' : `${reminder.getMonth() + 1}月${reminder.getDate()}日 `}${reminder.getHours()}:${String(reminder.getMinutes()).padStart(2, '0')} 再提醒` : ''
  const facts: { k: string; v: string; bad?: boolean }[] = [
    { k: '类别', v: sceneLabel[str(item.data.scene)] ?? '' },
    { k: '谁来办', v: owner ? (owner === user?.name ? '你' : owner) : '' },
    { k: '时间', v: due.text, bad: due.late },
    { k: '备注', v: str(item.data.note) },
    { k: '提醒', v: reminderText },
  ].filter((f) => f.v)
  const mine = !owner || owner === user?.name

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {nav(`第 ${handled + skipped.length + 1} 件 · 还剩 ${queue.length}`,
        <Pressable onPress={later} hitSlop={8}><Text style={s.navText}>稍后</Text></Pressable>)}
      <ScrollView contentContainerStyle={s.body}>
        <View style={[ui.card, s.task]}>
          <Text style={s.h2}>{titleOf(item)}</Text>
          {facts.length ? <View style={{ marginTop: 16, gap: 12 }}>
            {facts.map((f) => (
              <View key={f.k} style={{ flexDirection: 'row', gap: 12 }}>
                <Text style={s.k}>{f.k}</Text>
                <Text style={[s.v, f.bad && { color: c.bad }]}>{f.v}</Text>
              </View>
            ))}
          </View> : null}
          <View style={s.reply}>
            <Text style={s.replyK}>为什么问你</Text>
            <Text style={s.replyP}>{rec ? '这件事在录音或资料里提到了，但没说定要不要办、什么时候办。' : '这件事还没安排。'}你定一下：自己办、交给我盯着，还是不用了。</Text>
          </View>
          {rec ? <View style={s.foot}>
            <Pressable style={ui.src} hitSlop={8} onPress={() => router.push({ pathname: '/minutes', params: { id: rec } })}>
              <Icon name="doc.text" size={13} color={c.accInk} />
              <Text style={[ui.srcText, { color: c.accInk }]}>看出处：录音或资料的整理</Text>
            </Pressable>
            <Text style={ui.srcText}>内容由 AI 生成</Text>
          </View> : null}
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', paddingTop: 16, paddingBottom: 12 }}>
          {mine ? <Button title="安排成待办" onPress={() => act(() => moveItem(item.id, 'todo', { done: false, state: null }))} />
            : <Button title={`交给小禾盯着${owner}`} onPress={() => act(() => moveItem(item.id, 'watch', { state: null }))} />}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {mine ? <Button kind="text" title="交给小禾盯着" onPress={() => act(() => moveItem(item.id, 'watch', { state: null }))} />
            : <Button kind="text" title="我自己办" onPress={() => act(() => moveItem(item.id, 'todo', { done: false, state: null }))} />}
          <Button kind="text" title="不用了" onPress={() => act(() => deleteItem(item.id), false)} />
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
  mid: { fontSize: 15, fontWeight: '500', color: c.t1, fontVariant: ['tabular-nums'] },
  body: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  task: { padding: 20 },
  h2: { fontSize: 22, lineHeight: 30, fontWeight: '500', color: c.t1 },
  k: { width: 56, color: c.t3, fontSize: 13, lineHeight: 22 },
  v: { flex: 1, fontSize: 15, lineHeight: 22, color: c.t1 },
  reply: { marginTop: 20, backgroundColor: c.accTint, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 },
  replyK: { fontSize: 13, lineHeight: 18, color: c.accInk },
  replyP: { fontSize: 15, lineHeight: 22, marginTop: 4, color: c.t1 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  finished: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  done: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.ok, alignItems: 'center', justifyContent: 'center' },
})

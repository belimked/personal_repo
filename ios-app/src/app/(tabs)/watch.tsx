import * as Haptics from 'expo-haptics'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { showSheet } from '@/components/Sheet'
import { Card, GroupLabel, Icon, ui } from '@/components/ui'
import type { ApiItem } from '@/lib/api'
import { dueOf, recordingOf, str, titleOf, weekStart, when } from '@/lib/items'
import { sceneLabel } from '@/lib/recorder'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

/** 04 盯着：等你确认 / 我在办 / 本周办完。一件事只在一个地方。 */
export default function Watch() {
  const { watching, items, token, user, refreshing, refresh, addItem, setDone, deleteItem, moveItem } = useStore()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  // 进到这一页就同步一次，停留时每 20 秒再同步，不用手动下拉
  useFocusEffect(useCallback(() => {
    void refresh(true)
    const t = setInterval(() => { void refresh(true) }, 20000)
    return () => clearInterval(t)
  }, [refresh]))

  const live = items.filter((i) => !i.deleted)
  const confirm = live.filter((i) => i.kind === 'idea' || i.kind === 'stash')
  const doing = live.filter((i) => (i.kind === 'todo' && i.data.done !== true && !i.data.state) || i.kind === 'watch')
    .sort((a, b) => (dueOf(a) || '9999').localeCompare(dueOf(b) || '9999'))
  const since = weekStart().toISOString()
  const done = live.filter((i) => i.kind === 'todo' && i.data.done === true && !i.data.state && (str(i.data.done_at) || i.updated_at) >= since)

  const open = (i: ApiItem) => {
    const rec = recordingOf(i)
    if (rec) { Haptics.selectionAsync(); router.push({ pathname: '/minutes', params: { id: rec } }) }
    else more(i)
  }
  const more = (i: ApiItem) => {
    const acts: { text: string; run: () => void; bad?: boolean }[] = []
    if (i.kind === 'idea') {
      acts.push({ text: '安排成待办', run: () => moveItem(i.id, 'todo', { done: false }) })
      acts.push({ text: '交给小禾盯着', run: () => moveItem(i.id, 'watch') })
    }
    if (i.kind === 'todo') acts.push({ text: i.data.done === true ? '还没办完' : '办完了', run: () => setDone(i.id, i.data.done !== true) })
    if (i.kind === 'watch') acts.push({ text: '改成我自己办', run: () => moveItem(i.id, 'todo', { done: false }) })
    if (i.kind === 'todo' || i.kind === 'idea' || i.kind === 'watch') {
      const kind = i.kind
      const now = str(i.data.scene)
      if (now !== 'work') acts.push({ text: '标为工作', run: () => moveItem(i.id, kind, { scene: 'work' }) })
      if (now !== 'life') acts.push({ text: '标为生活', run: () => moveItem(i.id, kind, { scene: 'life' }) })
    }
    if (recordingOf(i)) acts.push({ text: '看录音纪要', run: () => router.push({ pathname: '/minutes', params: { id: recordingOf(i) } }) })
    acts.push({ text: i.kind === 'stash' ? '拿回来' : i.kind === 'idea' ? '不用了' : '删除', run: () => deleteItem(i.id), bad: true })
    showSheet(
      { title: titleOf(i), options: [...acts.map((a) => a.text), '取消'], cancelButtonIndex: acts.length, destructiveButtonIndex: acts.findIndex((a) => a.bad) },
      (n) => { if (n < acts.length) { Haptics.selectionAsync(); acts[n].run() } },
    )
  }
  const submit = () => {
    const t = draft.trim()
    if (!t) { setAdding(false); return }
    addItem('todo', t); setDraft(''); setAdding(false)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  const meta = (i: ApiItem) => {
    const due = when(dueOf(i))
    const owner = str(i.data.owner)
    const parts: string[] = []
    if (sceneLabel[str(i.data.scene)]) parts.push(sceneLabel[str(i.data.scene)])
    if (i.kind === 'watch') parts.push(owner && owner !== user?.name ? `等${owner}` : '我在盯')
    else if (owner && owner !== user?.name) parts.push(owner)
    if (str(i.data.note)) parts.push(str(i.data.note))
    if (recordingOf(i)) parts.push('来自录音')
    return { text: parts.join(' · '), due }
  }
  const row = (i: ApiItem, index: number, check: boolean) => {
    const m = meta(i)
    const finished = i.data.done === true
    return (
      <Pressable key={i.id} onPress={() => open(i)} onLongPress={() => more(i)} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.raised }]}>
        {index > 0 && <View style={[ui.sep, check && { left: 50 }]} />}
        {check ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: finished }} hitSlop={10}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDone(i.id, !finished) }} style={[s.check, finished && s.checked]}>
          {finished ? <Icon name="checkmark" size={12} color="#fff" weight="bold" /> : null}
        </Pressable> : <View style={s.dot}><Icon name={i.kind === 'watch' ? 'eye' : 'lightbulb'} size={15} color={c.t3} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={[s.t, finished && { color: c.t3, textDecorationLine: 'line-through' }]} numberOfLines={2}>{titleOf(i)}</Text>
          {m.text ? <Text style={s.n} numberOfLines={1}>{m.text}</Text> : null}
        </View>
        {m.due.text && !finished ? <Text style={[s.due, m.due.late && { color: c.bad }]}>{m.due.text}</Text> : null}
      </Pressable>
    )
  }

  if (!token) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <View style={s.head}><Text style={ui.title}>盯着</Text><Text style={ui.lede}>这 {watching.length} 件我在办，有变化再告诉你</Text></View>
          <Card>{watching.map((w, i) => <View key={w.title} style={s.row}>
            {i > 0 && <View style={ui.sep} />}
            <View style={{ flex: 1 }}><Text style={s.t}>{w.title}</Text><Text style={s.n}>{w.note}</Text></View>
          </View>)}</Card>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} />}>
        <View style={s.head}>
          <Text style={ui.title}>盯着</Text>
          <Text style={ui.lede}>{confirm.length ? `${confirm.length} 件等你定，` : ''}{doing.length} 件在办{done.length ? `，本周办完 ${done.length} 件` : ''}</Text>
        </View>

        {confirm.length ? <>
          <GroupLabel top={8}>等你确认</GroupLabel>
          <Card>{confirm.map((i, n) => row(i, n, false))}</Card>
          <Text style={s.note}>录音里提到、但没定下要办的事。点开看出处，长按安排、改工作/生活标签或删掉。</Text>
        </> : null}

        <GroupLabel top={confirm.length ? 24 : 8}>我在办</GroupLabel>
        <Card>
          {doing.length ? doing.map((i, n) => row(i, n, i.kind === 'todo')) : <View style={s.row}><Text style={[s.n, { marginTop: 0 }]}>你交给我的事会在这里，我替你盯着</Text></View>}
          {adding ? <View style={s.add}>
            <TextInput autoFocus style={s.input} value={draft} onChangeText={setDraft} placeholder="要办的事，比如：周五前交报销单" placeholderTextColor={c.t3}
              returnKeyType="done" onSubmitEditing={submit} onBlur={() => { if (!draft.trim()) setAdding(false) }} />
            <Pressable onPress={submit} hitSlop={8}><Text style={s.action}>添加</Text></Pressable>
          </View> : <Pressable onPress={() => setAdding(true)} style={({ pressed }) => [s.add, pressed && { backgroundColor: c.raised }]}>
            <Icon name="plus" size={15} color={c.accInk} /><Text style={[s.action, { flex: 1 }]}>记一件事</Text>
          </Pressable>}
        </Card>

        {done.length ? <>
          <Pressable onPress={() => setShowDone((v) => !v)} style={s.doneHead} hitSlop={6}>
            <Text style={ui.groupLabel}>本周办完 {done.length} 件</Text>
            <Icon name={showDone ? 'chevron.up' : 'chevron.down'} size={12} color={c.t3} />
          </Pressable>
          {showDone ? <Card>{done.map((i, n) => row(i, n, true))}</Card> : null}
        </> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  head: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56 },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  n: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  due: { fontSize: 13, color: c.t2 },
  dot: { width: 22, alignItems: 'center' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.chev, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: c.acc, borderColor: c.acc },
  add: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  input: { flex: 1, fontSize: 15, color: c.t1, paddingVertical: 12 },
  action: { fontSize: 15, color: c.accInk },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingTop: 8 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 16 },
})

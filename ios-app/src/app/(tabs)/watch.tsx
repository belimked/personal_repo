import { useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, GroupLabel, ui } from '@/components/ui'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
import type { ApiItem, Kind } from '@/lib/api'

const titleOf = (i: ApiItem) => typeof i.data.title === 'string' ? i.data.title : typeof i.data.text === 'string' ? i.data.text : '未命名'

/** 盯着及用户自己的待办、想法和暂存。演示模式保留原有预设列表。 */
export default function Watch() {
  const { watching, items, token, refreshing, refresh, addItem, setDone, deleteItem } = useStore()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const sections: { kind: 'todo' | 'idea' | 'stash' | 'watch'; label: string; placeholder?: string }[] = [
    { kind: 'todo', label: '待办', placeholder: '记一条待办' },
    { kind: 'idea', label: '想法', placeholder: '记一个想法' },
    { kind: 'stash', label: '先放着' },
    { kind: 'watch', label: '盯着的事', placeholder: '要盯着什么？' },
  ]
  const confirmDelete = (i: ApiItem) => Alert.alert(i.kind === 'stash' ? '拿回来？' : '删除这条？', titleOf(i), [
    { text: '取消', style: 'cancel' },
    { text: i.kind === 'stash' ? '拿回来' : '删除', style: 'destructive', onPress: () => deleteItem(i.id) },
  ])
  const submit = (kind: Kind) => {
    const title = drafts[kind]?.trim()
    if (!title || kind === 'stash' || kind === 'file' || kind === 'fact' || kind === 'setting') return
    addItem(kind, title)
    setDrafts((p) => ({ ...p, [kind]: '' }))
  }
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} refreshControl={token ? <RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} /> : undefined}>
        <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16 }}>
          <Text style={ui.title}>盯着</Text>
          <Text style={ui.lede}>这 {watching.length} 件我在办，有变化再告诉你</Text>
        </View>
        {token ? sections.map(({ kind, label, placeholder }) => {
          const list = items.filter((i) => i.kind === kind && !i.deleted)
          return <View key={kind}>
            <GroupLabel>{label}</GroupLabel>
            <Card>
              {list.length ? list.map((i, index) => <View key={i.id} style={s.row}>
                {index > 0 && <View style={ui.sep} />}
                <View style={s.line}>
                  {kind === 'todo' ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: i.data.done === true }} onPress={() => setDone(i.id, i.data.done !== true)} hitSlop={8} style={[s.check, i.data.done === true && s.checked]}><Text style={s.tick}>{i.data.done === true ? '✓' : ''}</Text></Pressable> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.t, i.data.done === true && { color: c.t3, textDecorationLine: 'line-through' }]}>{titleOf(i)}</Text>
                    {kind === 'todo' && typeof i.data.remind_at === 'string' ? <Text style={s.n}>提醒：{i.data.remind_at.replace('T', ' ').slice(0, 16)}</Text> : null}
                    {kind === 'watch' && typeof i.data.note === 'string' && i.data.note ? <Text style={s.n}>{i.data.note}</Text> : null}
                    {kind === 'stash' && typeof i.data.until === 'string' ? <Text style={s.n}>放到 {i.data.until.slice(0, 10)}</Text> : null}
                  </View>
                  <Pressable onPress={() => confirmDelete(i)} onLongPress={() => confirmDelete(i)} hitSlop={8} accessibilityLabel={kind === 'stash' ? '拿回来' : '删除'}><Text style={s.action}>{kind === 'stash' ? '拿回来' : '删除'}</Text></Pressable>
                </View>
              </View>) : <View style={s.row}><Text style={s.n}>{kind === 'watch' ? '还没有盯着的事' : `还没有${label}`}</Text></View>}
              {placeholder ? <View style={s.add}>
                <TextInput style={s.input} value={drafts[kind] ?? ''} onChangeText={(text) => setDrafts((p) => ({ ...p, [kind]: text }))} placeholder={placeholder} placeholderTextColor={c.t3} returnKeyType="done" onSubmitEditing={() => submit(kind)} />
                <Pressable onPress={() => submit(kind)} accessibilityLabel={`新增${label}`}><Text style={s.action}>添加</Text></Pressable>
              </View> : null}
            </Card>
          </View>
        }) : <Card>{watching.map((w, i) => <View key={w.title} style={s.row}>
          {i > 0 && <View style={ui.sep} />}
          <Text style={s.t}>{w.title}</Text>
          <Text style={s.n}>{w.note}</Text>
        </View>)}</Card>}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  row: { paddingVertical: 12, paddingHorizontal: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  n: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  action: { fontSize: 15, color: c.accInk, paddingVertical: 4 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: c.t3, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: c.acc, borderColor: c.acc },
  tick: { color: c.card, fontSize: 14 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 15, color: c.t1, paddingVertical: 12 },
})

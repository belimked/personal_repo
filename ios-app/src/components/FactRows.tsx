import { useEffect, useState } from 'react'
import { Alert, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { Card, Icon, ui } from './ui'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
import type { ApiItem } from '@/lib/api'

export function FactRows({ list, confirm = false }: { list: ApiItem[]; confirm?: boolean }) {
  const { removeFact, confirmFact } = useStore()
  const wrong = (f: ApiItem) => Alert.alert('删掉这条？', String(f.data.text), [{ text: '取消', style: 'cancel' }, { text: '删掉', style: 'destructive', onPress: () => removeFact(f.id) }])
  return <Card>{list.length ? list.map((f, n) => <FactRow key={f.id} fact={f} first={n === 0} onDelete={() => wrong(f)} confirmFact={confirm ? () => { void confirmFact(f.id).catch((e) => Alert.alert('确认失败', e instanceof Error ? e.message : '请稍后再试')) } : undefined} />) : <View style={{ padding: 16 }}><Text style={{ color: c.t3 }}>没有记下的</Text></View>}</Card>
}
function FactRow({ fact, first, onDelete, confirmFact }: { fact: ApiItem; first: boolean; onDelete: () => void; confirmFact?: () => void }) {
  const [x] = useState(() => new Animated.Value(0))
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(Math.max(-88, Math.min(0, g.dx))),
    onPanResponderRelease: (_, g) => Animated.spring(x, { toValue: g.dx < -80 ? -88 : 0, useNativeDriver: true }).start(),
  }))
  useEffect(() => { x.setValue(0) }, [fact.id, x])
  return <View style={s.wrap}>
    <Pressable style={s.delete} onPress={onDelete}><Text style={{ color: '#fff' }}>删掉</Text></Pressable>
    <Animated.View {...pan.panHandlers} style={[s.row, { transform: [{ translateX: x }] }]}>
      {!first && <View style={ui.sep} />}
      <Pressable style={{ flex: 1 }} onPress={() => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start()}><Text style={s.t}>{String(fact.data.text)}</Text><View style={ui.src}><Icon name="doc.text" size={13} color={c.t3} /><Text style={ui.srcText}>{typeof fact.data.from === 'string' ? fact.data.from : '来自：你告诉小禾的事'}</Text></View></Pressable>
      {confirmFact && fact.data.auto === true && fact.data.confirmed !== true ? <Pressable hitSlop={8} onPress={confirmFact}><Text style={s.no}>对</Text></Pressable> : null}
      <Pressable hitSlop={8} onPress={onDelete}><Text style={s.no}>不对</Text></Pressable>
    </Animated.View>
  </View>
}
const s = StyleSheet.create({ wrap: { overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: c.card }, delete: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 88, backgroundColor: c.bad, alignItems: 'center', justifyContent: 'center' }, t: { fontSize: 17, lineHeight: 24, color: c.t1 }, no: { fontSize: 15, lineHeight: 24, color: c.accInk, paddingHorizontal: 4 } })

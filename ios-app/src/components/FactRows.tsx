import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { Card, Icon, ui } from './ui'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
import type { ApiItem } from '@/lib/api'

type SwipeProps = { openId?: string | null; setOpenId?: (id: string | null) => void; onSwipe?: (phase: 'start' | 'end') => void }
export function FactRows({ list, confirm = false, openId, setOpenId, onSwipe }: { list: ApiItem[]; confirm?: boolean } & SwipeProps) {
  const { removeFact, confirmFact } = useStore()
  const wrong = (f: ApiItem) => Alert.alert('删掉这条？', String(f.data.text), [{ text: '取消', style: 'cancel' }, { text: '删掉', style: 'destructive', onPress: () => removeFact(f.id) }])
  return <Card>{list.length ? list.map((f, n) => <FactRow key={f.id} fact={f} first={n === 0} open={openId === f.id} onOpen={() => setOpenId?.(f.id)} onClose={() => setOpenId?.(null)} onSwipe={onSwipe} onDelete={() => { setOpenId?.(null); removeFact(f.id) }} onWrong={() => wrong(f)} confirmFact={confirm ? () => { void confirmFact(f.id).catch((e) => Alert.alert('确认失败', e instanceof Error ? e.message : '请稍后再试')) } : undefined} />) : <View style={{ padding: 16 }}><Text style={{ color: c.t3 }}>没有记下的</Text></View>}</Card>
}
function FactRow({ fact, first, open, onOpen, onClose, onSwipe, onDelete, onWrong, confirmFact }: { fact: ApiItem; first: boolean; open: boolean; onOpen: () => void; onClose: () => void; onDelete: () => void; onWrong: () => void; confirmFact?: () => void; onSwipe?: SwipeProps['onSwipe'] }) {
  const [x] = useState(() => new Animated.Value(0))
  const position = useRef(0)
  const start = useRef(0)
  const callbacks = useRef({ onOpen, onClose, onSwipe, open })
  useEffect(() => { callbacks.current = { onOpen, onClose, onSwipe, open } })
  useEffect(() => { Animated.spring(x, { toValue: open ? -88 : 0, useNativeDriver: true }).start(); position.current = open ? -88 : 0 }, [open, x])
  const settle = (target: number) => {
    position.current = target
    Animated.spring(x, { toValue: target, useNativeDriver: true }).start()
    if (target) callbacks.current.onOpen(); else callbacks.current.onClose()
  }
  const settleRef = useRef(settle)
  useEffect(() => { settleRef.current = settle })
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = position.current; callbacks.current.onSwipe?.('start'); x.stopAnimation() },
    onPanResponderMove: (_, g) => { position.current = Math.max(-88, Math.min(0, start.current + g.dx)); x.setValue(position.current) },
    onPanResponderRelease: () => { settleRef.current(position.current < -44 ? -88 : 0); callbacks.current.onSwipe?.('end') },
    onPanResponderTerminate: () => { settleRef.current(position.current < -44 ? -88 : 0); callbacks.current.onSwipe?.('end') },
  }))
  return <View style={s.wrap}>
    {!first && <View style={s.sep} />}
    <Pressable style={s.delete} onPress={onDelete}><Text style={s.deleteText}>删掉</Text></Pressable>
    <Animated.View {...pan.panHandlers} style={[s.row, { transform: [{ translateX: x }] }]}>
      <Pressable style={{ flex: 1 }} onPress={() => { if (open) settleRef.current(0) }}><Text style={s.t}>{String(fact.data.text)}</Text><View style={ui.src}><Icon name="doc.text" size={13} color={c.t3} /><Text style={ui.srcText}>{typeof fact.data.from === 'string' ? fact.data.from : '来自：你告诉小禾的事'}</Text></View></Pressable>
      {confirmFact && fact.data.auto === true && fact.data.confirmed !== true ? <Pressable hitSlop={8} onPress={() => { if (open) settleRef.current(0); else confirmFact() }}><Text style={s.no}>对</Text></Pressable> : null}
      <Pressable hitSlop={8} onPress={() => { if (open) settleRef.current(0); else onWrong() }}><Text style={s.no}>不对</Text></Pressable>
    </Animated.View>
  </View>
}
const s = StyleSheet.create({ wrap: { overflow: 'hidden' }, sep: { position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.line, zIndex: 2 }, row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: c.card }, delete: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 88, backgroundColor: c.bad, alignItems: 'center', justifyContent: 'center' }, deleteText: { color: '#fff', fontSize: 15 }, t: { fontSize: 17, lineHeight: 24, color: c.t1 }, no: { fontSize: 15, lineHeight: 24, color: c.accInk, paddingHorizontal: 4 } })

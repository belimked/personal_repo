import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Icon } from '@/components/ui'
import { clock, useRecorder, type Sent } from '@/lib/recorder'
import { c, mono } from '@/lib/theme'

/** “说一句”：点一下打字，按住说话、松开发送。 */
export function HoldToTalk({ title, onTap, onSent, style }: { title: string; onTap: () => void; onSent?: (s: Sent) => void; style?: StyleProp<ViewStyle> }) {
  const rec = useRecorder()
  const holding = useRef(false)
  const talking = rec.mode === 'hold'
  return (
    <Pressable
      onPress={() => { if (!holding.current) onTap() }}
      delayLongPress={250}
      onLongPress={() => { if (rec.mode) return; holding.current = true; void rec.start('hold') }}
      onPressOut={() => {
        if (!holding.current) return
        holding.current = false
        void rec.finish().then((sent) => { if (sent) onSent?.(sent) })
      }}
      style={({ pressed }) => [s.btn, talking ? s.talking : pressed && { backgroundColor: '#DEDEE3' }, style]}>
      <Icon name={talking ? 'waveform' : 'mic'} size={18} color={talking ? '#fff' : c.t2} />
      <Text style={[s.label, talking && { color: '#fff' }]}>{talking ? `松开发送 ${clock(rec.ms)}` : title}</Text>
    </Pressable>
  )
}

/** 按住时盖在页面上方的提示 */
export function TalkOverlay() {
  const rec = useRecorder()
  if (rec.mode !== 'hold') return null
  return (
    <View pointerEvents="none" style={s.overlay}>
      <View style={s.bubble}>
        <Icon name="waveform" size={28} color={c.acc} />
        <Text style={[s.time, mono]}>{clock(rec.ms)}</Text>
        <Text style={s.tip}>说完松开，我来记下要办的事</Text>
      </View>
    </View>
  )
}

/** 首页里一条语音消息，点开看转写和整理结果 */
export function VoiceNote({ id, ms }: { id: string; ms: number }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/minutes', params: { id } }) }} style={({ pressed }) => [s.note, pressed && { opacity: 0.6 }]}>
      <Icon name="waveform" size={16} color={c.accInk} />
      <Text style={s.noteText}>语音 {clock(ms)} · 小禾在听，马上回你</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  btn: { height: 50, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.raised, paddingHorizontal: 20 },
  talking: { backgroundColor: c.acc },
  label: { fontSize: 17, fontWeight: '500', color: c.t1 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bubble: { width: 220, alignItems: 'center', gap: 8, paddingVertical: 24, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  time: { fontSize: 28, fontWeight: '300', color: c.t1 },
  tip: { fontSize: 13, color: c.t3 },
  note: { alignSelf: 'flex-end', maxWidth: '85%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.accTint },
  noteText: { fontSize: 15, lineHeight: 22, color: c.accInk, flexShrink: 1 },
})

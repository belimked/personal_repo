import { Pressable, StyleSheet, Text } from 'react-native'
import { c } from '@/lib/theme'
import { Icon } from './ui'

/** 顶部“禾 管家”胶囊，点开下拉面板 */
export function Switcher({ open, onPress }: { open?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="切换面板" style={({ pressed }) => [s.wrap, pressed && { backgroundColor: c.raised }]}>
      <Text style={s.mark}>禾</Text>
      <Text style={s.label}>管家</Text>
      <Icon name={open ? 'chevron.up' : 'chevron.down'} size={13} color={c.t3} weight="semibold" />
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 12, marginTop: 4,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: 18, alignSelf: 'flex-start' },
  mark: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', backgroundColor: c.acc, color: '#fff', fontSize: 15, fontWeight: '500', textAlign: 'center', lineHeight: 28 },
  label: { fontSize: 15, fontWeight: '500', color: c.t1 },
})

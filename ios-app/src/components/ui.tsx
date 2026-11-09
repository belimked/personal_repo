import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { c } from '@/lib/theme'

export type SfName = Extract<SymbolViewProps['name'], string>

export function Icon({ name, size = 20, color = c.t1, weight = 'regular' }: { name: SfName; size?: number; color?: string; weight?: SymbolViewProps['weight'] }) {
  return <SymbolView name={name} size={size} tintColor={color} weight={weight} style={{ width: size, height: size }} accessible={false} accessibilityElementsHidden />
}

export const Chev = () => <Icon name="chevron.right" size={14} color={c.chev} weight="semibold" />

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>
}

/** iOS 设置风格的一行；first 为 false 时上方画分隔线 */
export function Row({ label, value, onPress, first, chevron = true, left, labelColor }: {
  label: ReactNode; value?: ReactNode; onPress?: () => void; first?: boolean; chevron?: boolean; left?: ReactNode; labelColor?: string
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [ui.row, pressed && { backgroundColor: c.raised }]}>
      {!first && <View style={ui.sep} />}
      {left}
      <Text style={[ui.rowLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
      {value != null && <Text style={ui.rowValue}>{value}</Text>}
      {chevron && onPress && <Chev />}
    </Pressable>
  )
}

export function GroupLabel({ children, top = 24 }: { children: ReactNode; top?: number }) {
  return <Text style={[ui.groupLabel, { paddingTop: top }]}>{children}</Text>
}

export function Button({ title, onPress, kind = 'primary', icon, style }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'second' | 'text'; icon?: SfName; style?: StyleProp<ViewStyle>
}) {
  if (kind === 'text') {
    return (
      <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [ui.btnText, pressed && { opacity: 0.5 }, style]}>
        <Text style={ui.btnTextLabel}>{title}</Text>
      </Pressable>
    )
  }
  const primary = kind === 'primary'
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ui.btn, primary ? ui.btnPrimary : ui.btnSecond,
      pressed && { backgroundColor: primary ? c.accPress : '#DEDEE3', transform: [{ scale: 0.98 }] }, style]}>
      {icon && <Icon name={icon} size={18} color={primary ? '#fff' : c.t2} />}
      <Text style={[ui.btnLabel, { color: primary ? '#fff' : c.t1 }]}>{title}</Text>
    </Pressable>
  )
}

export const ui = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  sep: { position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  rowLabel: { flex: 1, fontSize: 17, lineHeight: 24, color: c.t1 },
  rowValue: { fontSize: 15, color: c.t3 },
  groupLabel: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingBottom: 8 },
  btn: { height: 50, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimary: { flex: 1, backgroundColor: c.acc },
  btnSecond: { backgroundColor: c.raised, paddingHorizontal: 20 },
  btnLabel: { fontSize: 17, fontWeight: '500' },
  btnText: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  btnTextLabel: { fontSize: 15, color: c.accInk },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '500', color: c.t1 },
  lede: { fontSize: 15, lineHeight: 22, color: c.t2, marginTop: 8 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  srcText: { fontSize: 13, lineHeight: 18, color: c.t3 },
})

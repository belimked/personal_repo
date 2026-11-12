import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { c } from '@/lib/theme'

let show: ((text: string) => void) | null = null
export const toast = (text: string) => show?.(text)

export function Toast() {
  const [text, setText] = useState('')
  const [y] = useState(() => new Animated.Value(-160))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    show = (next) => {
      if (timer.current) clearTimeout(timer.current)
      setText(next)
      Animated.spring(y, { toValue: 0, useNativeDriver: true }).start()
      timer.current = setTimeout(() => Animated.timing(y, { toValue: -160, duration: 220, useNativeDriver: true }).start(), 1500)
    }
    return () => { show = null; if (timer.current) clearTimeout(timer.current) }
  }, [y])
  return <View pointerEvents="none" style={s.host}><Animated.View style={[s.card, { transform: [{ translateY: y }] }]}><Text style={s.label}>{text}</Text></Animated.View></View>
}

const s = StyleSheet.create({
  host: { position: 'absolute', top: 52, left: 16, right: 16, alignItems: 'center', zIndex: 20 },
  card: { backgroundColor: c.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 18, paddingVertical: 12 },
  label: { color: c.t2, fontSize: 13 },
})

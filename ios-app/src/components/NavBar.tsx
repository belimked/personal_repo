import { router, type Href } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { c } from '@/lib/theme'
import { Icon } from './ui'

/** 二级页顶部：‹ 返回 + 居中标题 */
export function NavBar({ back = '管家', fallback = '/', title, right }: { back?: string; fallback?: Href; title?: string; right?: ReactNode }) {
  return (
    <View style={s.nav}>
      <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace(fallback)} hitSlop={8} style={s.back}>
        <Icon name="chevron.left" size={20} color={c.accInk} weight="semibold" />
        <Text style={{ fontSize: 17, color: c.accInk }}>{back}</Text>
      </Pressable>
      <Text style={s.mid}>{title}</Text>
      <View style={[s.back, { justifyContent: 'flex-end' }]}>{right}</View>
    </View>
  )
}

const s = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, width: 88 },
  mid: { fontSize: 17, fontWeight: '500', color: c.t1 },
})

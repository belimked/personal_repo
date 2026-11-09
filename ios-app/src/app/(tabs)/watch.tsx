import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, ui } from '@/components/ui'
import { WATCHING } from '@/lib/data'
import { c } from '@/lib/theme'

/** 盯着：在办的事（v7 只做了列表，详情页后续补） */
export default function Watch() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 16 }}>
          <Text style={ui.title}>盯着</Text>
          <Text style={ui.lede}>这 {WATCHING.length} 件我在办，有变化再告诉你</Text>
        </View>
        <Card>
          {WATCHING.map((w, i) => (
            <View key={w.title} style={s.row}>
              {i > 0 && <View style={ui.sep} />}
              <Text style={s.t}>{w.title}</Text>
              <Text style={s.n}>{w.note}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  row: { paddingVertical: 12, paddingHorizontal: 16 },
  t: { fontSize: 17, lineHeight: 24, color: c.t1 },
  n: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
})

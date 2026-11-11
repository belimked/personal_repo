import * as Haptics from 'expo-haptics'
import { router, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '@/lib/api'
import { dayOf, doneAt, dueOf, isDone, isOpen, weekStart } from '@/lib/items'
import { useGive } from '@/lib/give'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
import { Switcher } from './Switcher'
import { Icon, Row, type SfName } from './ui'

/** 04 下拉面板：从顶部胶囊展开，底层压暗 */
export function Panel({ visible, onClose, onSettings }: { visible: boolean; onClose: () => void; onSettings: () => void }) {
  const insets = useSafeAreaInsets()
  const { items, token, demo } = useStore()
  const giveSheet = useGive()
  const [files, setFiles] = useState<number | null>(null)
  useEffect(() => {
    if (!visible || !token) return
    let alive = true
    void api.recordings(token).then((r) => { if (alive) setFiles(r.recordings.length) }).catch(() => {})
    return () => { alive = false }
  }, [visible, token])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const weekEnd = weekStart(1)
  const open = items.filter(isOpen)
  const dueToday = open.filter((i) => { const d = dayOf(dueOf(i)); return d && d <= today }).length
  const dueWeek = open.filter((i) => { const d = dayOf(dueOf(i)); return d && d < weekEnd }).length
  const doneWeek = items.filter((i) => isDone(i) && doneAt(i) >= weekStart().toISOString()).length

  const go = (href: Href) => { onClose(); Haptics.selectionAsync(); router.push(href) }
  const give = () => { onClose(); giveSheet(350) }

  const rows: { icon: SfName; label: string; value: string; onPress: () => void }[] = [
    { icon: 'calendar', label: '日程', value: dueToday ? `今天 ${dueToday} 件到期` : dueWeek ? `本周 ${dueWeek} 件` : '本周没有到期的', onPress: () => go('/schedule') },
    { icon: 'clock.arrow.circlepath', label: '历史事情', value: `本周办完 ${doneWeek} 件`, onPress: () => go('/history') },
    { icon: 'folder', label: '交给我的资料', value: files == null ? '' : `${files} 份`, onPress: () => go('/files') },
    { icon: 'plus.circle', label: '交资料', value: '照片、文件、录音', onPress: give },
    { icon: 'gearshape', label: '设置', value: '', onPress: () => { onClose(); onSettings() } },
  ]
  const shown = demo ? rows.filter((r) => r.label === '设置') : rows

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} onPress={onClose} accessibilityLabel="关闭面板" />
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16 }} pointerEvents="box-none">
        <Switcher open onPress={onClose} />
        <View style={s.panel}>
          {demo ? null : <Pressable style={s.search} onPress={() => go('/search')} accessibilityRole="search">
            <Icon name="magnifyingglass" size={17} color={c.t3} />
            <Text style={s.searchText}>搜说过的话、事情、资料</Text>
          </Pressable>}
          {shown.map((r, i) => (
            <Row key={r.label} first={i === 0} label={r.label} value={r.value}
              left={<View style={s.ic}><Icon name={r.icon} size={17} color={c.t2} /></View>} onPress={r.onPress} />
          ))}
          {demo ? <Text style={s.note}>登录后可以用搜索、日程、历史事情和资料。</Text> : null}
          <View style={s.grab} />
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  panel: { marginTop: 12, backgroundColor: c.card, borderRadius: 20, paddingTop: 12, paddingBottom: 4, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  search: { marginHorizontal: 12, marginBottom: 8, height: 40, borderRadius: 10, backgroundColor: '#EFEFF4', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchText: { fontSize: 17, color: c.t3 },
  ic: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, lineHeight: 18, color: c.t3, paddingHorizontal: 16, paddingVertical: 8 },
  grab: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#C7C7CC', alignSelf: 'center', marginTop: 8, marginBottom: 4 },
})

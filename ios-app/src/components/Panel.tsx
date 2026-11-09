import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { c } from '@/lib/theme'
import { Switcher } from './Switcher'
import { Icon, Row, type SfName } from './ui'

const ROWS: { icon: SfName; label: string; value: string }[] = [
  { icon: 'calendar', label: '日程', value: '今天 2 个会' },
  { icon: 'clock.arrow.circlepath', label: '历史事情', value: '本周办完 12 件' },
  { icon: 'folder', label: '交给我的资料', value: '86 份' },
  { icon: 'camera', label: '交资料', value: '拍照、文件、链接' },
  { icon: 'gearshape', label: '设置', value: '主动服务开' },
]

/** 04 下拉面板：从顶部胶囊展开，底层压暗模糊 */
export function Panel({ visible, onClose, onSettings }: { visible: boolean; onClose: () => void; onSettings: () => void }) {
  const insets = useSafeAreaInsets()
  const soon = (t: string) => Alert.alert(t, '原型里这一页还没做，先看简报和“我的”。')
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} onPress={onClose} accessibilityLabel="关闭面板" />
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16 }} pointerEvents="box-none">
        <Switcher open onPress={onClose} />
        <View style={s.panel}>
          <Pressable style={s.search} onPress={() => soon('搜索')}>
            <Icon name="magnifyingglass" size={17} color={c.t3} />
            <Text style={s.searchText}>搜索</Text>
          </Pressable>
          {ROWS.map((r, i) => (
            <Row key={r.label} first={i === 0} label={r.label} value={r.value}
              left={<View style={s.ic}><Icon name={r.icon} size={17} color={c.t2} /></View>}
              onPress={() => { if (r.label === '设置') { onClose(); onSettings() } else soon(r.label) }} />
          ))}
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
  grab: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#C7C7CC', alignSelf: 'center', marginTop: 8, marginBottom: 4 },
})

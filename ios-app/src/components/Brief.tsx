import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { ApiItem } from '@/lib/api'
import { dayLabel, dayOf, dueOf, isOpen, recordingOf, str, titleOf, when } from '@/lib/items'
import { sceneLabel, type Sent } from '@/lib/recorder'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'
import { HoldToTalk } from './HoldToTalk'
import { Button, Card, Chev, Icon, ui } from './ui'

const MAX = 4
/** 等你确认的事：录音、资料里提到但还没安排的（和“盯着”页同一口径） */
export const needsConfirm = (i: ApiItem) => !i.deleted && (i.kind === 'idea' || i.kind === 'stash')

/** 01 简报（登录后）：今天要办的 + 等你定的，全部来自你的真实事项 */
export function Brief({ onSay, onSent, tip }: { onSay: () => void; onSent: (s: Sent) => void; tip: string }) {
  const { items, user, setDone, brief } = useStore()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const open = items.filter(isOpen)
  const due = open.filter((i) => { const d = dayOf(dueOf(i)); return i.kind === 'todo' && !!d && d <= today })
    .sort((a, b) => dueOf(a).localeCompare(dueOf(b)))
  const confirm = items.filter(needsConfirm)
  const rows = [...due, ...confirm]
  const others = open.length - due.length

  const title = due.length && confirm.length ? `${due.length} 件今天要办，${confirm.length} 件等你定`
    : confirm.length ? `${confirm.length} 件事等你定`
    : due.length ? `今天有 ${due.length} 件事要办`
    : '现在没有要你管的事'
  const lede = rows.length ? (confirm.length ? '点一件看出处，或逐件过一遍' : '办完点圆圈；点一件看出处')
    : others ? `${others} 件我在办，有变化再告诉你` : '有事按住“说一句”，或交一段录音、一份资料给我'

  const open1 = (i: ApiItem) => {
    Haptics.selectionAsync()
    const rec = recordingOf(i)
    if (rec) router.push({ pathname: '/minutes', params: { id: rec } })
    else if (needsConfirm(i)) router.push({ pathname: '/review', params: { id: i.id } })
    else router.navigate('/watch')
  }

  return (
    <>
      <View style={s.head}>
        <Text style={ui.title}>{title}</Text>
        <Text style={ui.lede}>{lede}</Text>
      </View>
      {rows.length ? <Card>
        <View style={s.top}>
          <Text style={s.topText}>{dayLabel(today)}</Text>
          <Text style={[s.topText, { color: c.t3 }]}>{user?.name ?? ''}</Text>
        </View>
        {rows.slice(0, MAX).map((i, n) => {
          const todo = !needsConfirm(i)
          const d = when(dueOf(i))
          const owner = str(i.data.owner)
          const meta = [todo ? '' : '等你定', sceneLabel[str(i.data.scene)] ?? '', owner && owner !== user?.name ? owner : '', recordingOf(i) ? '来自录音或资料' : ''].filter(Boolean).join(' · ')
          return (
            <Pressable key={i.id} onPress={() => open1(i)} style={({ pressed }) => [s.item, pressed && { backgroundColor: c.raised }]}>
              {n > 0 && <View style={s.itemSep} />}
              {todo ? <Pressable hitSlop={10} accessibilityRole="checkbox" accessibilityLabel="办完了" style={s.check}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDone(i.id, true) }} />
                : <View style={s.dot}><Icon name="lightbulb" size={15} color={c.t3} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.h} numberOfLines={2}>{titleOf(i)}</Text>
                {meta ? <Text style={s.s} numberOfLines={1}>{meta}</Text> : null}
              </View>
              {d.text ? <Text style={[s.meta, d.late && { color: c.bad }]}>{d.text}</Text> : <View style={{ marginTop: 4 }}><Chev /></View>}
            </Pressable>
          )
        })}
        {rows.length > MAX ? <Pressable onPress={() => router.navigate('/watch')} style={({ pressed }) => [s.more, pressed && { backgroundColor: c.raised }]}>
          <Text style={s.moreText}>还有 {rows.length - MAX} 件，去“盯着”看全部</Text><Chev />
        </Pressable> : null}
      </Card> : null}
      {brief?.text ? <Text style={s.briefText}>{brief.text}</Text> : null}
      <View style={{ flex: 1 }} />
      <View style={s.actions}>
        {confirm.length ? <Button title="逐件过" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/review') }} />
          : others || rows.length ? <Button title="看全部" onPress={() => router.navigate('/watch')} /> : null}
        <HoldToTalk title="说一句" style={confirm.length || others || rows.length ? undefined : { flex: 1 }} onTap={onSay} onSent={onSent} />
      </View>
      {tip ? <Text style={[s.foot, { color: c.accInk }]}>{tip}</Text>
        : rows.length && others > 0 ? <Text style={s.foot}>另有 {others} 件我在办，不用你管</Text> : <View style={{ height: 12 }} />}
    </>
  )
}

const s = StyleSheet.create({
  briefText: { color: c.t2, fontSize: 13, lineHeight: 18, marginTop: 12, paddingHorizontal: 4 },
  head: { paddingHorizontal: 4, paddingVertical: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  topText: { fontSize: 13, lineHeight: 18, color: c.t2 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16 },
  itemSep: { position: 'absolute', top: 0, left: 50, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.chev, marginTop: 1 },
  dot: { width: 22, height: 24, alignItems: 'center', justifyContent: 'center' },
  h: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: c.t1 },
  s: { fontSize: 13, lineHeight: 18, color: c.t3, marginTop: 2 },
  meta: { fontSize: 13, lineHeight: 24, color: c.t2 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  moreText: { fontSize: 15, color: c.accInk },
  actions: { flexDirection: 'row', gap: 12, paddingTop: 16, paddingBottom: 12 },
  foot: { fontSize: 13, lineHeight: 18, color: c.t3, textAlign: 'center', paddingBottom: 12 },
})

import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { ApiItem } from '@/lib/api'
import { dayOf, dueOf, isOpen, str, titleOf, when } from '@/lib/items'
import { useStore } from '@/lib/store'
import { c, mono } from '@/lib/theme'
import { HoldToTalk } from './HoldToTalk'
import { Button, Card, Chev, ui } from './ui'
import type { Sent } from '@/lib/recorder'

export const needsConfirm = (i: ApiItem) => !i.deleted && (i.kind === 'idea' || i.kind === 'stash') && i.id !== 'demoItem'
export const briefQueue = (items: ApiItem[]) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return [...items.filter((i) => i.kind === 'todo' && isOpen(i) && !!dayOf(dueOf(i)) && dayOf(dueOf(i))! <= today)
    .sort((a, b) => dueOf(a).localeCompare(dueOf(b))), ...items.filter(needsConfirm)]
}
export const briefHeading = (brief: { created_at: string } | null, syncedAt: string | null) => {
  const date = new Date(brief?.created_at ?? syncedAt ?? Date.now())
  return { day: `周${'日一二三四五六'[new Date().getDay()]}简报`, time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
}

export function Brief({ onSay, onSent, tip }: { onSay: () => void; onSent: (s: Sent) => void; tip: string }) {
  const { items, brief, syncedAt, outcomes } = useStore()
  const rows = briefQueue(items).filter((i) => !(i.id in outcomes))
  const others = items.filter(isOpen).length - rows.filter((i) => i.kind === 'todo').length
  const head = briefHeading(brief, syncedAt)
  const open = (id?: string) => { void Haptics.selectionAsync(); router.push({ pathname: '/review', params: id ? { id } : {} }) }
  return <>
    <View style={s.head}>
      <Text style={ui.title}>{rows.length ? `${rows.length} 件事等你定` : '现在没有要你管的事'}</Text>
      <Text style={ui.lede}>{rows.length ? `${rows.every((i) => !!str(i.data.suggest)) ? '都已备好办法，' : ''}过一遍约 ${Math.max(1, Math.ceil(rows.length * 0.5))} 分钟` : others ? `${others} 件我在办，有变化再告诉你` : '有事按住“说一句”，或交一段录音、一份资料给我'}</Text>
    </View>
    {rows.length ? <Card>
      <View style={s.top}><Text style={s.topText}>{head.day}</Text><Text style={[s.topText, mono, { color: c.t3 }]}>{head.time}</Text></View>
      {brief?.text ? <Text style={s.briefText} numberOfLines={2}>{brief.text}</Text> : null}
      {rows.slice(0, 3).map((i, n) => {
        const due = when(dueOf(i))
        const rawDue = dueOf(i)
        const dueText = due.text === '今天' && /T\d{2}:\d{2}/.test(rawDue) ? `${rawDue.slice(11, 16)} 前` : due.text
        const meta = [i.kind !== 'todo' ? '等你定' : '', str(i.data.owner), str(i.data.note)].filter(Boolean).join(' · ')
        return <Pressable key={i.id} onPress={() => open(i.id)} style={({ pressed }) => [s.item, pressed && { backgroundColor: c.raised }]}>
          {n > 0 && <View style={s.sep} />}
          <Text style={[s.no, mono]}>{String(n + 1).padStart(2, '0')}</Text>
          <View style={{ flex: 1 }}><Text style={s.h} numberOfLines={2}>{titleOf(i)}</Text><Text style={s.sub} numberOfLines={1}>{str(i.data.suggest_short) || meta}</Text></View>
          {dueText ? <Text style={[s.meta, mono, due.late && { color: c.bad }]}>{dueText}</Text> : <Chev />}
        </Pressable>
      })}
      {rows.length > 3 ? <Pressable style={s.more} onPress={() => router.navigate('/watch')}><Text style={{ color: c.accInk }}>还有 {rows.length - 3} 件，去“盯着”看全部</Text><Chev /></Pressable> : null}
    </Card> : null}
    <View style={{ flex: 1 }} />
    <View style={s.actions}>{rows.length ? <Button title="开始" onPress={() => open()} /> : null}<HoldToTalk title={rows.length ? '说一句' : '有别的事，说一句'} style={rows.length ? undefined : { flex: 1 }} onTap={onSay} onSent={onSent} /></View>
    <Text style={[s.foot, tip ? { color: c.accInk } : undefined]}>{tip || (rows.length && others > 0 ? `另有 ${others} 件我在办，不用你管` : ' ')}</Text>
  </>
}

const s = StyleSheet.create({
  head: { paddingHorizontal: 4, paddingVertical: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  topText: { fontSize: 13, lineHeight: 18, color: c.t2 },
  briefText: { color: c.t3, fontSize: 12, lineHeight: 17, paddingHorizontal: 16, paddingTop: 8 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16 },
  sep: { position: 'absolute', top: 0, left: 56, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  no: { width: 28, fontSize: 13, lineHeight: 24, color: c.t3 },
  h: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: c.t1 },
  sub: { fontSize: 15, lineHeight: 22, color: c.t2, marginTop: 2 },
  meta: { fontSize: 13, lineHeight: 24, color: c.t2 },
  more: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  actions: { flexDirection: 'row', gap: 12, paddingTop: 16, paddingBottom: 12 },
  foot: { fontSize: 13, lineHeight: 18, color: c.t3, textAlign: 'center', paddingBottom: 12 },
})

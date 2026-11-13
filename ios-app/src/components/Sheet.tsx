import { useEffect, useState } from 'react'
import { ActionSheetIOS, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ActionSheetIOSOptions, type AlertButton } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { c } from '@/lib/theme'

// ActionSheetIOS 和 Alert.prompt 只有 iOS 有：安卓上前者直接抛错闪退，后者什么也不弹。
// iOS 照旧走系统原生；安卓用下面的 <SheetHost /> 画一个底部菜单 / 输入框。

type SheetReq = { kind: 'sheet'; opts: ActionSheetIOSOptions; done: (n: number) => void }
type PromptReq = { kind: 'prompt'; title: string; message?: string; buttons: AlertButton[]; value: string }
type Req = SheetReq | PromptReq

let open: ((r: Req) => void) | null = null

export function showSheet(opts: ActionSheetIOSOptions, done: (n: number) => void) {
  if (Platform.OS === 'ios') return ActionSheetIOS.showActionSheetWithOptions(opts, done)
  open?.({ kind: 'sheet', opts, done })
}

type PromptButton = Omit<AlertButton, 'onPress'> & { onPress?: (text?: string) => void }

/** 与 Alert.prompt 同参数（只用到 plain-text） */
export function prompt(title: string, message?: string, buttons: PromptButton[] = [{ text: '好' }], _type?: 'plain-text', value = '') {
  if (Platform.OS === 'ios') return Alert.prompt(title, message, buttons as AlertButton[], 'plain-text', value)
  open?.({ kind: 'prompt', title, message, buttons: buttons as AlertButton[], value })
}

export function SheetHost() {
  const insets = useSafeAreaInsets()
  const [req, setReq] = useState<Req | null>(null)
  const [text, setText] = useState('')
  useEffect(() => {
    open = (r) => { setText(r.kind === 'prompt' ? r.value : ''); setReq(r) }
    return () => { open = null }
  }, [])
  if (Platform.OS === 'ios' || !req) return null

  const close = () => setReq(null)
  // 先关再回调：回调里可能马上再弹下一个
  const pick = (n: number) => { const r = req; close(); if (r.kind === 'sheet') setTimeout(() => r.done(n), 0) }
  const press = (b: AlertButton) => { close(); setTimeout(() => (b.onPress as ((t?: string) => void) | undefined)?.(text), 0) }

  if (req.kind === 'prompt') {
    const cancel = req.buttons.find((b) => b.style === 'cancel')
    return (
      <Modal transparent animationType="fade" visible onRequestClose={() => cancel ? press(cancel) : close()}>
        <View style={s.center}>
          <View style={s.dialog}>
            <Text style={s.title}>{req.title}</Text>
            {!!req.message && <Text style={s.message}>{req.message}</Text>}
            <TextInput style={s.input} value={text} onChangeText={setText} autoFocus autoCapitalize="none" autoCorrect={false} />
            <View style={s.buttons}>
              {req.buttons.map((b, i) => (
                <Pressable key={i} onPress={() => press(b)} style={s.btn}>
                  <Text style={[s.btnText, b.style === 'cancel' && { color: c.t2 }, b.style === 'destructive' && { color: c.bad }]}>{b.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    )
  }

  const { title, message, options, cancelButtonIndex, destructiveButtonIndex } = req.opts
  const bad = Array.isArray(destructiveButtonIndex) ? destructiveButtonIndex : [destructiveButtonIndex]
  const cancelAt = cancelButtonIndex ?? -1
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => pick(cancelAt)}>
      <Pressable style={s.dim} onPress={() => pick(cancelAt)} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
        {(!!title || !!message) && (
          <View style={s.head}>
            {!!title && <Text style={s.headTitle}>{title}</Text>}
            {!!message && <Text style={s.headMsg}>{message}</Text>}
          </View>
        )}
        <ScrollView style={{ maxHeight: 420 }}>
          {options.map((o, i) => i === cancelAt ? null : (
            <Pressable key={i} onPress={() => pick(i)} style={({ pressed }) => [s.opt, pressed && { backgroundColor: c.raised }]}>
              <Text style={[s.optText, bad.includes(i) && { color: c.bad }]}>{o}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {cancelAt >= 0 && (
          <Pressable onPress={() => pick(cancelAt)} style={({ pressed }) => [s.opt, s.cancel, pressed && { backgroundColor: c.raised }]}>
            <Text style={[s.optText, { color: c.t2 }]}>{options[cancelAt]}</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  head: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  headTitle: { fontSize: 15, fontWeight: '600', color: c.t1, textAlign: 'center' },
  headMsg: { fontSize: 13, color: c.t2, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  opt: { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  optText: { fontSize: 17, color: c.acc },
  cancel: { borderTopWidth: 8, borderTopColor: c.bg },
  center: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 32 },
  dialog: { backgroundColor: c.card, borderRadius: 14, padding: 20 },
  title: { fontSize: 17, fontWeight: '600', color: c.t1 },
  message: { fontSize: 13, color: c.t2, marginTop: 6 },
  input: { marginTop: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: c.t1, backgroundColor: c.bg },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 8 },
  btn: { paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { fontSize: 15, fontWeight: '600', color: c.acc },
})

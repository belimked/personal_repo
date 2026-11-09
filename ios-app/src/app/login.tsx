import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Card, ui } from '@/components/ui'
import { useStore } from '@/lib/store'
import { c } from '@/lib/theme'

export default function Login() {
  const { login, enterDemo } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await login(email, password) }
    catch (e) { setError(e instanceof Error ? e.message : '登录失败，请稍后再试') }
    finally { setBusy(false) }
  }
  return <SafeAreaView style={{ flex: 1 }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
      <View style={{ paddingBottom: 24 }}><Text style={ui.title}>小禾</Text><Text style={ui.lede}>登录后，接着把事办好</Text></View>
      <Card>
        <TextInput style={s.input} placeholder="邮箱" placeholderTextColor={c.t3} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <View style={ui.sep} />
        <TextInput style={s.input} placeholder="密码" placeholderTextColor={c.t3} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
      </Card>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={{ marginTop: 20 }}><Button title={busy ? '登录中…' : '登录'} onPress={submit} /></View>
      {busy ? <ActivityIndicator color={c.acc} style={{ marginTop: 12 }} /> : null}
      <Button kind="text" title="填入演示账号" onPress={() => { setEmail('lily@demo.com'); setPassword('demo1234'); setError('') }} />
      <Button kind="text" title="先不登录，看演示" onPress={enterDemo} />
    </KeyboardAvoidingView>
  </SafeAreaView>
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  input: { height: 56, paddingHorizontal: 16, fontSize: 17, color: c.t1 },
  error: { marginTop: 12, color: c.bad, fontSize: 13 },
})

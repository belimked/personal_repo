import * as Notifications from 'expo-notifications'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { recordingIdOf } from '@/lib/push'
import { Toast } from '@/components/Toast'
import { SheetHost } from '@/components/Sheet'
import { RecorderProvider } from '@/lib/recorder'
import { StoreProvider, useStore } from '@/lib/store'
import { c } from '@/lib/theme'

/** 点推送打开对应纪要；冷启动时等登录状态就绪后再跳转。 */
function useOpenFromPush(enabled: boolean) {
  const last = Notifications.useLastNotificationResponse()
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !last) return
    const id = recordingIdOf(last)
    const data = last.notification.request.content.data
    const key = last.notification.request.identifier
    if (handled.current === key) return
    handled.current = key
    if (data?.type === 'brief') router.navigate('/')
    else if (data?.type === 'remind' && typeof data.item_id === 'string') router.navigate('/watch')
    else if (id) router.push({ pathname: '/minutes', params: { id } })
    Notifications.clearLastNotificationResponse()
  }, [enabled, last])
}

function Routes() {
  const { ready, token, demo } = useStore()
  useOpenFromPush(ready && !!token)
  if (!ready) return null
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
    <Stack.Protected guard={!!token || demo}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="review" options={{ gestureEnabled: true }} />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="facts" />
      <Stack.Screen name="sensitive" />
      <Stack.Screen name="minutes" />
      <Stack.Screen name="records" />
      <Stack.Screen name="search" />
      <Stack.Screen name="schedule" />
      <Stack.Screen name="history" />
      <Stack.Screen name="chats" />
      <Stack.Screen name="files" />
    </Stack.Protected>
    <Stack.Protected guard={!token && !demo}>
      <Stack.Screen name="login" />
    </Stack.Protected>
  </Stack>
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <RecorderProvider>
          <StatusBar style="dark" />
          <Routes />
          <Toast />
          <SheetHost />
        </RecorderProvider>
      </StoreProvider>
    </SafeAreaProvider>
  )
}

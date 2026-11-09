import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StoreProvider, useStore } from '@/lib/store'
import { c } from '@/lib/theme'

function Routes() {
  const { ready, token, demo } = useStore()
  if (!ready) return null
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
    <Stack.Protected guard={!!token || demo}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="review" options={{ gestureEnabled: true }} />
      <Stack.Screen name="privacy" />
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
        <StatusBar style="dark" />
        <Routes />
      </StoreProvider>
    </SafeAreaProvider>
  )
}

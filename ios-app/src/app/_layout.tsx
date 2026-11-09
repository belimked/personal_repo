import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StoreProvider } from '@/lib/store'
import { c } from '@/lib/theme'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="review" options={{ gestureEnabled: true }} />
          <Stack.Screen name="privacy" />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  )
}

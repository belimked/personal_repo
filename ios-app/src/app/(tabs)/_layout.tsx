import * as Haptics from 'expo-haptics'
import { Tabs } from 'expo-router'
import { Icon } from '@/components/ui'
import { c } from '@/lib/theme'

export default function TabLayout() {
  return (
    <Tabs
      screenListeners={{ tabPress: () => { Haptics.selectionAsync() } }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
        tabBarActiveTintColor: c.acc,
        tabBarInactiveTintColor: c.t3,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarStyle: { backgroundColor: 'rgba(249,249,251,0.96)', borderTopColor: c.line },
      }}>
      <Tabs.Screen name="index" options={{ title: '管家', tabBarIcon: ({ color, focused }) => <Icon name={focused ? 'house.fill' : 'house'} size={24} color={String(color)} /> }} />
      <Tabs.Screen name="watch" options={{ title: '盯着', tabBarIcon: ({ color, focused }) => <Icon name={focused ? 'eye.fill' : 'eye'} size={24} color={String(color)} /> }} />
      <Tabs.Screen name="me" options={{ title: '我的', tabBarIcon: ({ color, focused }) => <Icon name={focused ? 'person.fill' : 'person'} size={24} color={String(color)} /> }} />
    </Tabs>
  )
}

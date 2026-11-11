import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { api } from './api'

// Ad Hoc 包使用 production APNs 环境（描述文件 aps-environment=production）。
const PUSH_ENV = 'production'
const DEVICE_KEY = 'daily-assistant-device-token'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

/** 登录后登记本机推送；用户拒绝通知或拿不到 token 时静默跳过。 */
export async function registerPush(auth: string): Promise<void> {
  if (Platform.OS !== 'ios') return
  try {
    let perm = await Notifications.getPermissionsAsync()
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } })
    if (!perm.granted) return
    const { data } = await Notifications.getDevicePushTokenAsync()
    if (typeof data !== 'string' || !data) return
    await api.registerDevice(auth, data, PUSH_ENV)
    await SecureStore.setItemAsync(DEVICE_KEY, data)
  } catch { /* 推送不影响主流程，下次启动再试 */ }
}

/** 退出登录前注销本机，避免推给已退出的账号。 */
export async function unregisterPush(auth: string): Promise<void> {
  try {
    const device = await SecureStore.getItemAsync(DEVICE_KEY)
    if (!device) return
    await api.unregisterDevice(auth, device)
    await SecureStore.deleteItemAsync(DEVICE_KEY)
  } catch { /* 忽略 */ }
}

/** 推送里带的录音 id。 */
export function recordingIdOf(response: Notifications.NotificationResponse | null | undefined): string | null {
  const id = response?.notification.request.content.data?.recording_id
  return typeof id === 'string' && id ? id : null
}

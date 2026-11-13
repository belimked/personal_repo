import * as Location from 'expo-location'
import { Location as LocationNext } from 'expo-location/next'
import * as SecureStore from 'expo-secure-store'
import { Linking, Platform } from 'react-native'
import { api, type RoutePlace } from './api'

const LAST_UPLOAD = 'xiaohe-location-last-upload'
let uploading = false

// 旧接口在安卓上只走谷歌定位服务，国内没有 GMS 的手机（华为、小米等）拿不到坐标。
// 安卓改用 next 接口：默认 GMS 不可用时自动退到系统 LocationManager。
async function locate(): Promise<{ lat: number; lng: number; accuracy: number | null }> {
  if (Platform.OS === 'android') {
    const p = await LocationNext.getPosition({ maxCachedAge: 120, timeout: 15 })
    if (!p) throw new Error('no fix')
    return { lat: p.coordinates.latitude, lng: p.coordinates.longitude, accuracy: p.horizontalAccuracy }
  }
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
}

export async function currentCoordinates(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const permission = await Location.getForegroundPermissionsAsync()
    if (!permission.granted) return undefined
    const { lat, lng } = await locate()
    return { lat, lng }
  } catch { return undefined }
}

/** Only the OS's undetermined state may trigger a permission dialog. */
export async function updateLocation(token: string, enabled: boolean) {
  if (uploading) return
  uploading = true
  try {
    let permission = await Location.getForegroundPermissionsAsync()
    if (permission.status === 'undetermined') permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted || !enabled) return
    const last = Number(await SecureStore.getItemAsync(LAST_UPLOAD)) || 0
    if (Date.now() - last < 10 * 60 * 1000) return
    const { lat, lng, accuracy } = await locate()
    const result = await api.putLocation(token, lat, lng, accuracy)
    if (result.stored) await SecureStore.setItemAsync(LAST_UPLOAD, String(Date.now()))
  } catch { /* location is best effort */ }
  finally { uploading = false }
}

export function openMap(place: string | RoutePlace) {
  const destination = typeof place === 'string' ? place : `${place.lat},${place.lng}`
  const name = typeof place === 'string' ? place : place.name
  // maps:// 是 Apple 地图，安卓用 geo:，交给手机上装的地图（高德、百度、谷歌等）
  const url = Platform.OS === 'android'
    ? typeof place === 'string' ? `geo:0,0?q=${encodeURIComponent(place)}` : `geo:${destination}?q=${destination}(${encodeURIComponent(name)})`
    : `maps://?daddr=${encodeURIComponent(destination)}&q=${encodeURIComponent(name)}`
  void Linking.openURL(url).catch(() => {})
}

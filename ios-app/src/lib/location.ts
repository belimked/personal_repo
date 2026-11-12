import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import { Linking } from 'react-native'
import { api, type RoutePlace } from './api'

const LAST_UPLOAD = 'xiaohe-location-last-upload'
let uploading = false

export async function currentCoordinates(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const permission = await Location.getForegroundPermissionsAsync()
    if (!permission.granted) return undefined
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { lat: position.coords.latitude, lng: position.coords.longitude }
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
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    const { latitude, longitude, accuracy } = position.coords
    const result = await api.putLocation(token, latitude, longitude, accuracy)
    if (result.stored) await SecureStore.setItemAsync(LAST_UPLOAD, String(Date.now()))
  } catch { /* location is best effort */ }
  finally { uploading = false }
}

export function openMap(place: string | RoutePlace) {
  const destination = typeof place === 'string' ? place : `${place.lat},${place.lng}`
  const name = typeof place === 'string' ? place : place.name
  void Linking.openURL(`maps://?daddr=${encodeURIComponent(destination)}&q=${encodeURIComponent(name)}`).catch(() => {})
}

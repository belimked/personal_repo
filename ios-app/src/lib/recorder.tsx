import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from 'expo-audio'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert } from 'react-native'
import { api, type AudioFile, type Recording } from './api'
import { useStore } from './store'

// 单声道 64 kbps AAC：1 小时约 29 MB，低于后台 95 MB 上限。
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 }
const MIN_MS = 800
const MAX_BYTES = 95 * 1024 * 1024
const TYPES: Record<string, string> = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/opus' }
// 交资料：照片、截图、PDF、Word、txt，和后台 fileTypes 一致
const FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain',
}
const MAX_FILE = 30 * 1024 * 1024
export type Source = 'camera' | 'photos' | 'files'

/** hold：按住“说一句”；meeting：录会议，点一下开始、再点停止，切页面不中断。 */
export type Mode = 'hold' | 'meeting'
export type Sent = { recording: Recording; ms: number }

interface Recorder {
  mode: Mode | null
  ms: number
  uploading: number
  start: (mode: Mode) => Promise<boolean>
  finish: () => Promise<Sent | null>
  cancel: () => Promise<void>
  importFile: () => Promise<Sent | null>
  giveFile: (from: Source) => Promise<Sent | null>
}

const Ctx = createContext<Recorder | null>(null)

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s % 60).padStart(2, '0')}`
}

export function RecorderProvider({ children }: { children: ReactNode }) {
  const { token } = useStore()
  const recorder = useAudioRecorder(OPTIONS)
  const state = useAudioRecorderState(recorder, 250)
  const [mode, setMode] = useState<Mode | null>(null)
  const [uploading, setUploading] = useState(0)
  const starting = useRef<Promise<boolean> | null>(null)
  const startedAt = useRef<Date>(new Date())
  const modeRef = useRef<Mode | null>(null)

  const send = useCallback(async (file: AudioFile, recordedAt: Date, ms: number, title?: string, kind: 'meeting' | 'voice' | 'file' = 'meeting'): Promise<Sent | null> => {
    if (!token) { Alert.alert('请先登录', '登录后才能交给小禾处理。'); return null }
    setUploading((n) => n + 1)
    try {
      for (;;) {
        try {
          const { recording } = await api.upload(token, file, recordedAt.toISOString(), title, kind)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          return { recording, ms }
        } catch (e) {
          const message = e instanceof Error ? e.message : '上传失败'
          const again = await new Promise<boolean>((resolve) => Alert.alert(kind === 'file' ? '资料没传上去' : '录音没传上去', message, [
            { text: '放弃', style: 'destructive', onPress: () => resolve(false) },
            { text: '重试', onPress: () => resolve(true) },
          ]))
          if (!again) return null
        }
      }
    } finally { setUploading((n) => n - 1) }
  }, [token])

  const start = useCallback((next: Mode) => {
    if (starting.current) return starting.current
    starting.current = (async () => {
      const perm = await requestRecordingPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('需要麦克风权限', '在“设置 > 小禾”里打开麦克风，才能录音。')
        return false
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      startedAt.current = new Date()
      modeRef.current = next
      setMode(next)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      return true
    })().catch(() => { Alert.alert('没能开始录音', '麦克风可能正被其他 App 占用。'); return false })
    const pending = starting.current
    void pending.then((ok) => { if (!ok && starting.current === pending) starting.current = null })
    return pending
  }, [recorder])

  const stop = useCallback(async () => {
    const ok = await (starting.current ?? Promise.resolve(false))
    starting.current = null
    if (!ok) return null
    const ms = Date.now() - startedAt.current.getTime()
    try { await recorder.stop() } catch { /* 已停止 */ }
    setMode(null)
    await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => {})
    return recorder.uri ? { uri: recorder.uri, ms } : null
  }, [recorder])

  const finish = useCallback(async () => {
    const kind = modeRef.current === 'hold' ? 'voice' : 'meeting'
    const clip = await stop()
    if (!clip) return null
    if (clip.ms < MIN_MS) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); return null }
    const stamp = startedAt.current.toISOString().replace(/[-:]/g, '').slice(0, 15)
    return send({ uri: clip.uri, name: `rec-${stamp}.m4a`, type: 'audio/mp4' }, startedAt.current, clip.ms, undefined, kind)
  }, [send, stop])

  const cancel = useCallback(async () => { await stop() }, [stop])

  const importFile = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true }).catch(() => null)
    const asset = picked && !picked.canceled ? picked.assets[0] : null
    if (!asset) return null
    const ext = asset.name.split('.').pop()?.toLowerCase() ?? ''
    if (!TYPES[ext]) { Alert.alert('不支持这种文件', '支持 m4a、mp3、wav、opus 格式的音频。'); return null }
    if ((asset.size ?? 0) > MAX_BYTES) { Alert.alert('文件太大', '音频文件不能超过 95 MB。'); return null }
    const at = asset.lastModified ? new Date(asset.lastModified) : new Date()
    return send({ uri: asset.uri, name: asset.name, type: TYPES[ext] }, at, 0, asset.name.replace(/\.[^.]+$/, ''))
  }, [send])

  // 交资料：拍照 / 相册 / 文件（PDF、Word、txt、图片），后台识别文字后整理成摘要和事项
  const giveFile = useCallback(async (from: Source) => {
    let file: AudioFile | null = null
    let size = 0
    let at = new Date()
    if (from === 'files') {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png', 'image/heic'],
        copyToCacheDirectory: true,
      }).catch(() => null)
      const asset = picked && !picked.canceled ? picked.assets[0] : null
      if (!asset) return null
      const ext = asset.name.split('.').pop()?.toLowerCase() ?? ''
      if (!FILE_TYPES[ext]) { Alert.alert('不支持这种文件', '支持照片（jpg、png、heic）、PDF、Word（docx）和 txt。'); return null }
      file = { uri: asset.uri, name: asset.name, type: FILE_TYPES[ext] }
      size = asset.size ?? 0
      if (asset.lastModified) at = new Date(asset.lastModified)
    } else {
      const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(from === 'camera' ? '需要相机权限' : '需要照片权限', `在“设置 > 小禾”里打开${from === 'camera' ? '相机' : '照片'}，才能把图片交给小禾。`)
        return null
      }
      // compatible + quality<1：iOS 把 HEIC 转成 JPEG 交出来，后台 OCR 直接能读
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'], quality: 0.85,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }
      const picked = await (from === 'camera' ? ImagePicker.launchCameraAsync(opts) : ImagePicker.launchImageLibraryAsync(opts)).catch(() => null)
      const asset = picked && !picked.canceled ? picked.assets[0] : null
      if (!asset) return null
      const type = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
      file = { uri: asset.uri, name: `img-${stamp}.${type === 'image/png' ? 'png' : 'jpg'}`, type }
      size = asset.fileSize ?? 0
    }
    if (size > MAX_FILE) { Alert.alert('文件太大', '资料不能超过 30 MB。'); return null }
    const title = from === 'files' ? file.name.replace(/\.[^.]+$/, '') : undefined
    return send(file, at, 0, title, 'file')
  }, [send])

  const value = useMemo<Recorder>(() => ({
    mode, ms: mode ? state.durationMillis : 0, uploading, start, finish, cancel, importFile, giveFile,
  }), [mode, state.durationMillis, uploading, start, finish, cancel, importFile, giveFile])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRecorder() {
  const r = useContext(Ctx)
  if (!r) throw new Error('RecorderProvider missing')
  return r
}

export const sceneLabel: Record<string, string> = { work: '工作', life: '生活', mixed: '工作和生活' }
export const statusLabel: Record<Recording['status'], string> = {
  queued: '排队中', transcribing: '正在转成文字', summarizing: '正在整理纪要', done: '已整理', failed: '没能处理',
}
export const fileStatusLabel: Record<Recording['status'], string> = {
  queued: '排队中', transcribing: '正在读文字', summarizing: '正在整理', done: '已整理', failed: '没能读出来',
}
export const isFile = (r: { kind?: string | null }) => r.kind === 'file'
/** 资料的类型名：照片 / PDF / Word / 文本 */
export const fileType = (mime?: string | null) =>
  !mime ? '资料' : mime.startsWith('image/') ? '照片' : mime === 'application/pdf' ? 'PDF' : mime === 'text/plain' ? '文本' : 'Word'

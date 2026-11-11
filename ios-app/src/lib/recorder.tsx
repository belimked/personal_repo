import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from 'expo-audio'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert } from 'react-native'
import { api, type AudioFile, type Recording } from './api'
import { useStore } from './store'

// 单声道 64 kbps AAC：1 小时约 29 MB，低于后台 95 MB 上限。
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 }
const MIN_MS = 800
const MAX_BYTES = 95 * 1024 * 1024
const TYPES: Record<string, string> = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/opus' }

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

  const send = useCallback(async (file: AudioFile, recordedAt: Date, ms: number, title?: string): Promise<Sent | null> => {
    if (!token) { Alert.alert('请先登录', '登录后录音才能转成文字和纪要。'); return null }
    setUploading((n) => n + 1)
    try {
      for (;;) {
        try {
          const { recording } = await api.upload(token, file, recordedAt.toISOString(), title)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          return { recording, ms }
        } catch (e) {
          const message = e instanceof Error ? e.message : '上传失败'
          const again = await new Promise<boolean>((resolve) => Alert.alert('录音没传上去', message, [
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
    const clip = await stop()
    if (!clip) return null
    if (clip.ms < MIN_MS) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); return null }
    const stamp = startedAt.current.toISOString().replace(/[-:]/g, '').slice(0, 15)
    return send({ uri: clip.uri, name: `rec-${stamp}.m4a`, type: 'audio/mp4' }, startedAt.current, clip.ms)
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

  const value = useMemo<Recorder>(() => ({
    mode, ms: mode ? state.durationMillis : 0, uploading, start, finish, cancel, importFile,
  }), [mode, state.durationMillis, uploading, start, finish, cancel, importFile])
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

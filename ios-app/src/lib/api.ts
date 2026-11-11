import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

export const API_BASE = (Constants.expoConfig?.extra?.apiBase as string | undefined ?? 'https://personal-repo-api.saulxj.ggff.net/api').replace(/\/$/, '')
const TOKEN_KEY = 'daily-assistant-token'

export type User = { id: string; email: string; name: string; role: 'user' | 'admin' }
export type Kind = 'todo' | 'stash' | 'watch' | 'idea' | 'file' | 'fact' | 'setting'
export type ApiItem = { id: string; kind: Kind; data: Record<string, unknown>; created_at: string; updated_at: string; deleted: number }
export type Message = { id: string; role: 'user' | 'assistant'; content: string; model: string | null; created_at: string }

export type Minutes = {
  title?: string; summary?: string; points?: string[]; decisions?: string[]
  action_items?: { text: string; owner?: string; due?: string; is_self?: boolean }[]
}
export type Recording = { id: string; title: string | null; status: 'queued' | 'transcribing' | 'summarizing' | 'done' | 'failed'; error: string | null; recorded_at: string | null; created_at: string; duration_s?: number | null; scene?: 'work' | 'life' | 'mixed' | null; queue_position?: number; kind?: 'meeting' | 'voice' }
export type Transcript = { text: string; speakers: number | null; segments: { speaker?: number; text: string; start_ms?: number; end_ms?: number }[] | null }
export type AudioFile = { uri: string; name: string; type: string }

// Expo SDK 58 的全局 fetch（expo/fetch）不支持 { uri, name, type } 形式的文件，
// 上传改用 React Native 自带的 XMLHttpRequest，由原生层按 uri 读取本地文件。
function uploadAudio(token: string, file: AudioFile, recordedAt?: string, title?: string, kind: 'meeting' | 'voice' = 'meeting'): Promise<{ recording: Recording }> {
  const form = new FormData()
  form.append('kind', kind)
  if (title) form.append('title', title)
  if (recordedAt) form.append('recorded_at', recordedAt)
  form.append('file', file as unknown as Blob)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/recordings`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.timeout = 10 * 60 * 1000
    xhr.onload = () => {
      let json: { recording?: Recording; message?: string } = {}
      try { json = JSON.parse(xhr.responseText) } catch { /* 非 JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && json.recording) resolve({ recording: json.recording })
      else reject(new ApiError(xhr.status, json.message ?? `上传失败（${xhr.status}）`))
    }
    xhr.onerror = () => reject(new ApiError(0, '网络不可用，上传失败'))
    xhr.ontimeout = () => reject(new ApiError(0, '上传超时'))
    xhr.send(form)
  })
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
}

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
}

export async function request<T>(path: string, token?: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method, signal: controller.signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const json = await response.json() as T & { message?: string }
    if (!response.ok) throw new ApiError(response.status, json.message ?? '请求失败，请稍后再试')
    return json
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, controller.signal.aborted ? '请求超时' : '网络不可用')
  } finally { clearTimeout(timer) }
}

export const api = {
  login: (email: string, password: string) => request<{ token: string; user: User }>('/auth/login', undefined, 'POST', { email, password }),
  logout: (token: string) => request<{ ok: boolean }>('/auth/logout', token, 'POST'),
  me: (token: string) => request<{ user: User }>('/me', token),
  items: (token: string, kind?: Kind) => request<{ items: ApiItem[] }>(kind ? `/items?kind=${kind}` : '/items', token),
  putItem: (token: string, id: string, kind: Kind, data: Record<string, unknown>) => request<{ item: ApiItem }>('/items', token, 'POST', { id, kind, data }),
  patchItem: (token: string, id: string, data: Record<string, unknown>) => request<{ item: ApiItem }>(`/items/${encodeURIComponent(id)}`, token, 'PATCH', { data }),
  deleteItem: (token: string, id: string) => request<{ ok: boolean }>(`/items/${encodeURIComponent(id)}`, token, 'DELETE'),
  chat: (token: string, message: string) => request<{ reply: string; model: string; thread: string; fallback: boolean }>('/chat', token, 'POST', { message, thread: 'home', mode: 'chat' }),
  messages: (token: string) => request<{ messages: Message[] }>('/messages?thread=home&limit=50', token),
  registerDevice: (token: string, device: string, env: 'production' | 'sandbox') => request<{ ok: boolean }>('/devices', token, 'POST', { token: device, platform: 'ios', env }),
  unregisterDevice: (token: string, device: string) => request<{ ok: boolean }>(`/devices/${encodeURIComponent(device)}`, token, 'DELETE'),
  recording: (token: string, id: string) => request<{ recording: Recording }>(`/recordings/${encodeURIComponent(id)}`, token),
  minutes: (token: string, id: string) => request<Minutes>(`/recordings/${encodeURIComponent(id)}/minutes`, token),
  transcript: (token: string, id: string) => request<Transcript>(`/recordings/${encodeURIComponent(id)}/transcript`, token),
  recordings: (token: string) => request<{ recordings: Recording[] }>('/recordings', token),
  retry: (token: string, id: string) => request<{ ok: boolean }>(`/recordings/${encodeURIComponent(id)}/retry`, token, 'POST', {}),
  removeRecording: (token: string, id: string) => request<{ ok: boolean }>(`/recordings/${encodeURIComponent(id)}`, token, 'DELETE'),
  upload: uploadAudio,
}

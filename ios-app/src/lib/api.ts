import Constants from 'expo-constants'
import { fetch as expoFetch } from 'expo/fetch'
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
export type Recording = { id: string; title: string | null; status: 'queued' | 'transcribing' | 'summarizing' | 'done' | 'failed'; error: string | null; recorded_at: string | null; created_at: string; duration_s?: number | null; scene?: 'work' | 'life' | 'mixed' | null; queue_position?: number; kind?: 'meeting' | 'voice' | 'file'; mime?: string | null }
export type Transcript = { text: string; speakers: number | null; segments: { speaker?: number; text: string; start_ms?: number; end_ms?: number; page?: number }[] | null }
export type AudioFile = { uri: string; name: string; type: string }
export type HomeData = { user: User; items: ApiItem[]; messages: Message[]; has_more: boolean; brief: { kind: string; text: string; created_at: string } | null }
export type AskResult = SearchResult & { answer: string; mode: 'ask' | 'keyword' }
export type SearchResult = {
  said: { type: 'recording' | 'chat'; recording_id?: string; title?: string; role?: string; at: string; snippet: string; start_ms?: number }[]
  things: { id: string; kind: Kind; title: string; due: string; done: boolean; owner: string; recording_id?: string }[]
  files: { recording_id: string; title: string; kind: string; at: string; duration_s: number | null; snippet?: string }[]
}

// Expo SDK 58 的全局 fetch（expo/fetch）不支持 { uri, name, type } 形式的文件，
// 上传改用 React Native 自带的 XMLHttpRequest，由原生层按 uri 读取本地文件。
function uploadAudio(token: string, file: AudioFile, recordedAt?: string, title?: string, kind: 'meeting' | 'voice' | 'file' = 'meeting'): Promise<{ recording: Recording }> {
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
  home: (token: string, msgLimit = 10) => request<HomeData>(`/home?msg_limit=${msgLimit}`, token),
  messages: (token: string, limit = 10, before?: string) => request<{ messages: Message[]; has_more: boolean }>(`/messages?thread=home&limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`, token),
  ask: (token: string, q: string) => request<AskResult>('/ask', token, 'POST', { q }),
  registerDevice: (token: string, device: string, env: 'production' | 'sandbox') => request<{ ok: boolean }>('/devices', token, 'POST', { token: device, platform: 'ios', env }),
  unregisterDevice: (token: string, device: string) => request<{ ok: boolean }>(`/devices/${encodeURIComponent(device)}`, token, 'DELETE'),
  recording: (token: string, id: string) => request<{ recording: Recording }>(`/recordings/${encodeURIComponent(id)}`, token),
  minutes: (token: string, id: string) => request<Minutes>(`/recordings/${encodeURIComponent(id)}/minutes`, token),
  transcript: (token: string, id: string) => request<Transcript>(`/recordings/${encodeURIComponent(id)}/transcript`, token),
  recordings: (token: string) => request<{ recordings: Recording[] }>('/recordings', token),
  retry: (token: string, id: string) => request<{ ok: boolean }>(`/recordings/${encodeURIComponent(id)}/retry`, token, 'POST', {}),
  setScene: (token: string, id: string, scene: 'work' | 'life' | 'mixed') => request<{ ok: boolean }>(`/recordings/${encodeURIComponent(id)}/scene`, token, 'POST', { scene }),
  removeRecording: (token: string, id: string) => request<{ ok: boolean }>(`/recordings/${encodeURIComponent(id)}`, token, 'DELETE'),
  upload: uploadAudio,
  search: (token: string, q: string) => request<SearchResult>(`/search?q=${encodeURIComponent(q)}`, token),
}

/** Parse SSE across arbitrary byte boundaries, including multi-line data and CRLF. */
export async function streamChat(token: string, message: string, onDelta: (text: string) => void): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await expoFetch(`${API_BASE}/chat/stream`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message, thread: 'home', mode: 'chat' }),
    })
    if (!response.ok || !response.body) throw new ApiError(response.status, '流式回复不可用')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', reply: string | null = null
    const consume = (block: string) => {
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
      if (!data) return
      const event = JSON.parse(data) as { delta?: string; done?: boolean; reply?: string }
      if (event.delta) onDelta(event.delta)
      if (event.done) reply = event.reply ?? ''
    }
    while (true) {
      const { done, value } = await reader.read()
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) !== -1) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 2) }
      if (done) break
    }
    if (buffer.trim()) consume(buffer)
    if (reply === null) throw new Error('流中断')
    return reply
  } finally { clearTimeout(timer) }
}

export async function askWithFallback(token: string, q: string): Promise<AskResult> {
  try { return await api.ask(token, q) }
  catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e
    return { ...await api.search(token, q), answer: '', mode: 'keyword' }
  }
}

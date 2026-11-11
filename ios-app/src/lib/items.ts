import type { ApiItem } from './api'

export const str = (v: unknown) => typeof v === 'string' ? v : ''
export const titleOf = (i: ApiItem) => str(i.data.title) || str(i.data.text) || '未命名'
export const recordingOf = (i: ApiItem) => {
  const src = i.data.source as { type?: string; recording_id?: string } | undefined
  return src?.type === 'recording' && src.recording_id ? src.recording_id : ''
}
export const dueOf = (i: ApiItem) => str(i.data.due) || str(i.data.date) || str(i.data.remind_at).slice(0, 10)
export const doneAt = (i: ApiItem) => str(i.data.done_at) || i.updated_at

/** 本周一 0 点（本地时间） */
export const weekStart = (offsetWeeks = 0) => {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  return d
}
export const dayOf = (due: string) => {
  const d = new Date(due.slice(0, 10) + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}
const WEEK = '日一二三四五六'

/** 截止日写成“今天 / 明天 / 周五 / 11月20日”，过期标红 */
export function when(due: string): { text: string; late: boolean } {
  if (!due) return { text: '', late: false }
  const d = dayOf(due)
  if (!d) return { text: due, late: false }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { text: `${-days} 天前到期`, late: true }
  if (days === 0) return { text: '今天', late: false }
  if (days === 1) return { text: '明天', late: false }
  if (days < 7) return { text: '周' + WEEK[d.getDay()], late: false }
  return { text: `${d.getMonth() + 1}月${d.getDate()}日`, late: false }
}

/** 日期标题：“今天 · 11月11日 周三” */
export function dayLabel(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  const base = `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`
  return days === 0 ? `今天 · ${base}` : days === 1 ? `明天 · ${base}` : base
}

/** 正在进行的事：未完成的待办、盯着的事 */
export const isOpen = (i: ApiItem) => !i.deleted && ((i.kind === 'todo' && i.data.done !== true && !i.data.state) || i.kind === 'watch')
/** 办完的事（不含简报演示数据） */
export const isDone = (i: ApiItem) => !i.deleted && i.kind === 'todo' && i.data.done === true && !i.data.state

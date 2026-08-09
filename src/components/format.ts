import type { LeadStatusLike } from '@/core/stats'

/**
 * Форматирование в одном месте: даты, длительности и подписи статусов
 * встречаются на каждой странице и в выгрузке, и расходиться им нельзя.
 */

const LOCALE = 'ru-RU'

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })

const dayShortFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short' })

const numberFmt = new Intl.NumberFormat(LOCALE)

export function formatDateTime(value: Date): string {
  return dateTimeFmt.format(value)
}

export function formatDate(value: Date): string {
  return dateFmt.format(value)
}

export function formatTime(value: Date): string {
  return timeFmt.format(value)
}

export function formatNumber(value: number): string {
  return numberFmt.format(value)
}

/** `YYYY-MM-DD` → `09 авг.`; парсим руками, чтобы не уехать в UTC. */
export function formatDayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number)
  return dayShortFmt.format(new Date(year, month - 1, day)).replace('.', '')
}

/** `dd.MM.yyyy HH:mm:ss` — для CSV, где нужна полная точность и стабильный вид. */
export function formatStamp(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()} ` +
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  )
}

/** `YYYY-MM-DD` в локальной зоне — значение для `<input type="date">`. */
export function toDateInputValue(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'

  const total = Math.max(0, Math.round(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60

  if (days > 0) return hours > 0 ? `${days} д ${hours} ч` : `${days} д`
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`
  if (minutes > 0) return seconds > 0 ? `${minutes} мин ${seconds} с` : `${minutes} мин`
  return `${seconds} с`
}

export function formatPercent(share: number | null | undefined, digits = 0): string {
  if (share === null || share === undefined || !Number.isFinite(share)) return '—'
  return `${(share * 100).toFixed(digits)}%`
}

export function plural(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

// ── Статусы ─────────────────────────────────────────────────────────────────

export type AssignmentStatusLike = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
export type Tone = 'ok' | 'warn' | 'bad' | 'done' | 'neutral'

export const LEAD_STATUS_LABEL: Record<LeadStatusLike, string> = {
  NEW: 'Новая',
  ASSIGNED: 'У менеджера',
  TAKEN: 'Взята',
  CLOSED: 'Закрыта',
  LOST: 'Потеряна',
}

/** Взято — зелёное, потеряно — красное, ждёт реакции — янтарное. */
export const LEAD_STATUS_TONE: Record<LeadStatusLike, Tone> = {
  NEW: 'neutral',
  ASSIGNED: 'warn',
  TAKEN: 'ok',
  CLOSED: 'done',
  LOST: 'bad',
}

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatusLike, string> = {
  PENDING: 'ждёт',
  ACCEPTED: 'взял',
  DECLINED: 'отказ',
  EXPIRED: 'не ответил',
}

export const ASSIGNMENT_STATUS_TONE: Record<AssignmentStatusLike, Tone> = {
  PENDING: 'warn',
  ACCEPTED: 'ok',
  DECLINED: 'neutral',
  EXPIRED: 'bad',
}

export const TONE_BADGE: Record<Tone, string> = {
  ok: 'badge-ok',
  warn: 'badge-warn',
  bad: 'badge-bad',
  done: 'badge-done',
  neutral: 'badge-neutral',
}

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  done: 'text-done',
  neutral: 'text-ink',
}

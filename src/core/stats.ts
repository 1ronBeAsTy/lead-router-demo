/**
 * Агрегаты чистыми функциями — считаются над уже выбранными строками,
 * поэтому покрываются тестами и переиспользуются админкой и выгрузкой.
 *
 * КОНТРАКТ — сигнатуры менять нельзя.
 */

export type LeadStatusLike = 'NEW' | 'ASSIGNED' | 'TAKEN' | 'CLOSED' | 'LOST'

export interface LeadStatRow {
  id: string
  createdAt: Date
  status: LeadStatusLike
  /** Когда менеджер нажал «Беру». `null`, если ещё никто не взял. */
  takenAt: Date | null
  takenById: string | null
  /** Сколько назначений было отправлено по этой заявке. */
  attempts: number
}

export interface Summary {
  todayCount: number
  weekCount: number
  totalCount: number
  takenCount: number
  lostCount: number
  openCount: number
  /** Медиана и среднее времени до первого «Беру», в миллисекундах. `null`, если брать нечего. */
  avgFirstResponseMs: number | null
  medianFirstResponseMs: number | null
  /** Доля взятых с первой попытки среди всех взятых, 0..1. `null`, если взятых нет. */
  firstAttemptShare: number | null
}

export interface DayBucket {
  /** `YYYY-MM-DD` */
  date: string
  total: number
  taken: number
  lost: number
}

export interface ManagerStatRow {
  managerId: string
  assigned: number
  accepted: number
  declined: number
  expired: number
  closed: number
  avgResponseMs: number | null
}

export function summarize(rows: readonly LeadStatRow[], now: Date): Summary {
  throw new Error('TODO: реализовать в шаге 7')
}

/** Последние `days` дней включая сегодня, от старого к новому, без пропусков. */
export function bucketByDay(rows: readonly LeadStatRow[], days: number, now: Date): DayBucket[] {
  throw new Error('TODO: реализовать в шаге 7')
}

export interface AssignmentStatRow {
  managerId: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
  sentAt: Date
  resolvedAt: Date | null
  leadClosed: boolean
}

export function summarizeManagers(rows: readonly AssignmentStatRow[]): ManagerStatRow[] {
  throw new Error('TODO: реализовать в шаге 7')
}

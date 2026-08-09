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

/** Заявка считается взятой, пока её не потеряли: `TAKEN` и `CLOSED` — одно и то же для воронки. */
function isTaken(status: LeadStatusLike): boolean {
  return status === 'TAKEN' || status === 'CLOSED'
}

/** Локальная полночь указанного дня — сравнения по календарным суткам, а не по UTC. */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Сдвиг на целые сутки через конструктор Date, чтобы переход на летнее время не сломал ряд. */
function shiftDays(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta)
}

/** `YYYY-MM-DD` в локальной зоне. `toISOString` тут не годится — он уводит в UTC. */
function dayKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/** Честная медиана: при чётной длине — среднее двух центральных. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function summarize(rows: readonly LeadStatRow[], now: Date): Summary {
  const todayStart = startOfLocalDay(now).getTime()
  const tomorrowStart = shiftDays(now, 1).getTime()
  // «Неделя» — сегодня плюс шесть предыдущих суток, а не now минус 168 часов.
  const weekStart = shiftDays(now, -6).getTime()

  let todayCount = 0
  let weekCount = 0
  let takenCount = 0
  let lostCount = 0
  let openCount = 0
  let firstAttemptTaken = 0

  const responseMs: number[] = []

  for (const row of rows) {
    const created = row.createdAt.getTime()
    if (created >= todayStart && created < tomorrowStart) todayCount += 1
    if (created >= weekStart && created < tomorrowStart) weekCount += 1

    if (isTaken(row.status)) {
      takenCount += 1
      if (row.attempts <= 1) firstAttemptTaken += 1
    } else if (row.status === 'LOST') {
      lostCount += 1
    } else {
      openCount += 1
    }

    if (row.takenAt) {
      const delta = row.takenAt.getTime() - created
      if (Number.isFinite(delta) && delta >= 0) responseMs.push(delta)
    }
  }

  return {
    todayCount,
    weekCount,
    totalCount: rows.length,
    takenCount,
    lostCount,
    openCount,
    avgFirstResponseMs: mean(responseMs),
    medianFirstResponseMs: median(responseMs),
    firstAttemptShare: takenCount === 0 ? null : firstAttemptTaken / takenCount,
  }
}

/** Последние `days` дней включая сегодня, от старого к новому, без пропусков. */
export function bucketByDay(rows: readonly LeadStatRow[], days: number, now: Date): DayBucket[] {
  if (!Number.isFinite(days) || days < 1) return []
  const span = Math.floor(days)

  const series: DayBucket[] = []
  const index = new Map<string, DayBucket>()
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const key = dayKey(shiftDays(now, -offset))
    const bucket: DayBucket = { date: key, total: 0, taken: 0, lost: 0 }
    series.push(bucket)
    index.set(key, bucket)
  }

  for (const row of rows) {
    const bucket = index.get(dayKey(row.createdAt))
    if (!bucket) continue // строка вне окна — просто не попадает в ряд
    bucket.total += 1
    if (isTaken(row.status)) bucket.taken += 1
    else if (row.status === 'LOST') bucket.lost += 1
  }

  return series
}

export interface AssignmentStatRow {
  managerId: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
  sentAt: Date
  resolvedAt: Date | null
  leadClosed: boolean
}

/**
 * По менеджерам, в порядке первого появления в `rows`.
 *
 * `avgResponseMs` — среднее время до реакции по назначениям, на которые менеджер
 * действительно ответил (`ACCEPTED` или `DECLINED`). Протухшие в среднее не идут:
 * там время реакции равно SLA и означает молчание, а не скорость.
 */
export function summarizeManagers(rows: readonly AssignmentStatRow[]): ManagerStatRow[] {
  const byManager = new Map<string, ManagerStatRow>()
  const responses = new Map<string, number[]>()

  for (const row of rows) {
    let stat = byManager.get(row.managerId)
    if (!stat) {
      stat = {
        managerId: row.managerId,
        assigned: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        closed: 0,
        avgResponseMs: null,
      }
      byManager.set(row.managerId, stat)
      responses.set(row.managerId, [])
    }

    stat.assigned += 1
    if (row.status === 'ACCEPTED') {
      stat.accepted += 1
      if (row.leadClosed) stat.closed += 1
    } else if (row.status === 'DECLINED') {
      stat.declined += 1
    } else if (row.status === 'EXPIRED') {
      stat.expired += 1
    }

    if (row.resolvedAt && (row.status === 'ACCEPTED' || row.status === 'DECLINED')) {
      const delta = row.resolvedAt.getTime() - row.sentAt.getTime()
      if (Number.isFinite(delta) && delta >= 0) responses.get(row.managerId)!.push(delta)
    }
  }

  for (const stat of byManager.values()) {
    stat.avgResponseMs = mean(responses.get(stat.managerId) ?? [])
  }

  return [...byManager.values()]
}

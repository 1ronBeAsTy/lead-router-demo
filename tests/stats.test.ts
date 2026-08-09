import { describe, expect, it } from 'vitest'
import {
  bucketByDay,
  summarize,
  summarizeManagers,
  type AssignmentStatRow,
  type LeadStatRow,
  type LeadStatusLike,
} from '../src/core/stats'

const NOW = new Date(2026, 2, 15, 14, 30, 0) // 15 марта 2026, локальное время
const MINUTE = 60_000

/** Локальная дата со сдвигом в днях от `NOW` — чтобы тесты не зависели от таймзоны. */
function at(daysAgo: number, hour = 12, minute = 0): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour, minute, 0)
}

function lead(partial: Partial<LeadStatRow> & { id: string }): LeadStatRow {
  return {
    createdAt: at(0),
    status: 'NEW' as LeadStatusLike,
    takenAt: null,
    takenById: null,
    attempts: 0,
    ...partial,
  }
}

describe('summarize', () => {
  it('на пустом входе отдаёт нули и null вместо метрик', () => {
    const result = summarize([], NOW)
    expect(result).toEqual({
      todayCount: 0,
      weekCount: 0,
      totalCount: 0,
      takenCount: 0,
      lostCount: 0,
      openCount: 0,
      avgFirstResponseMs: null,
      medianFirstResponseMs: null,
      firstAttemptShare: null,
    })
  })

  it('считает сегодня по календарным суткам, а не по «минус 24 часа»', () => {
    const rows = [
      lead({ id: 'a', createdAt: at(0, 0, 5) }), // сегодня, но больше 14 часов назад
      lead({ id: 'b', createdAt: at(0, 13, 59) }),
      lead({ id: 'c', createdAt: at(1, 23, 59) }), // вчера поздним вечером
    ]
    expect(summarize(rows, NOW).todayCount).toBe(2)
  })

  it('неделя — это сегодня плюс шесть предыдущих суток', () => {
    const rows = [
      lead({ id: 'a', createdAt: at(0) }),
      lead({ id: 'b', createdAt: at(6, 0, 1) }), // самый край окна
      lead({ id: 'c', createdAt: at(7, 23, 59) }), // уже за окном
    ]
    const result = summarize(rows, NOW)
    expect(result.weekCount).toBe(2)
    expect(result.totalCount).toBe(3)
  })

  it('раскладывает статусы на взято / потеряно / в работе', () => {
    const rows = [
      lead({ id: 'a', status: 'TAKEN', takenAt: at(0, 12, 5), attempts: 1 }),
      lead({ id: 'b', status: 'CLOSED', takenAt: at(0, 12, 3), attempts: 1 }),
      lead({ id: 'c', status: 'LOST', attempts: 3 }),
      lead({ id: 'd', status: 'NEW' }),
      lead({ id: 'e', status: 'ASSIGNED', attempts: 1 }),
    ]
    const result = summarize(rows, NOW)
    expect(result.takenCount).toBe(2)
    expect(result.lostCount).toBe(1)
    expect(result.openCount).toBe(2)
  })

  it('среднее и медиана времени до первого «Беру» при нечётном числе значений', () => {
    const base = at(0, 10, 0)
    const rows = [
      lead({ id: 'a', status: 'TAKEN', createdAt: base, takenAt: new Date(base.getTime() + 1 * MINUTE), attempts: 1 }),
      lead({ id: 'b', status: 'TAKEN', createdAt: base, takenAt: new Date(base.getTime() + 2 * MINUTE), attempts: 1 }),
      lead({ id: 'c', status: 'TAKEN', createdAt: base, takenAt: new Date(base.getTime() + 9 * MINUTE), attempts: 1 }),
      lead({ id: 'd', status: 'LOST', createdAt: base, attempts: 3 }), // без takenAt — в расчёт не идёт
    ]
    const result = summarize(rows, NOW)
    expect(result.medianFirstResponseMs).toBe(2 * MINUTE)
    expect(result.avgFirstResponseMs).toBe(4 * MINUTE)
  })

  it('медиана при чётном числе значений — среднее двух центральных', () => {
    const base = at(0, 10, 0)
    const rows = [10, 2, 8, 4].map((m, i) =>
      lead({
        id: `l${i}`,
        status: 'TAKEN',
        createdAt: base,
        takenAt: new Date(base.getTime() + m * MINUTE),
        attempts: 1,
      }),
    )
    expect(summarize(rows, NOW).medianFirstResponseMs).toBe(6 * MINUTE)
  })

  it('доля первой попытки считается только среди взятых', () => {
    const rows = [
      lead({ id: 'a', status: 'TAKEN', takenAt: at(0, 12, 1), attempts: 1 }),
      lead({ id: 'b', status: 'CLOSED', takenAt: at(0, 12, 1), attempts: 1 }),
      lead({ id: 'c', status: 'CLOSED', takenAt: at(0, 12, 1), attempts: 3 }),
      lead({ id: 'd', status: 'LOST', attempts: 3 }), // потерянные знаменатель не раздувают
    ]
    expect(summarize(rows, NOW).firstAttemptShare).toBeCloseTo(2 / 3, 10)
  })

  it('без взятых заявок доля первой попытки — null, а не ноль', () => {
    const rows = [lead({ id: 'a', status: 'LOST', attempts: 3 }), lead({ id: 'b', status: 'NEW' })]
    expect(summarize(rows, NOW).firstAttemptShare).toBeNull()
  })
})

describe('bucketByDay', () => {
  it('отдаёт непрерывный ряд нужной длины от старого к новому', () => {
    const series = bucketByDay([], 7, NOW)
    expect(series).toHaveLength(7)
    expect(series[0].date).toBe('2026-03-09')
    expect(series[6].date).toBe('2026-03-15')

    const dates = series.map((b) => b.date)
    expect([...dates].sort()).toEqual(dates) // строго по возрастанию
  })

  it('не пропускает пустые дни', () => {
    const rows = [lead({ id: 'a', createdAt: at(3) }), lead({ id: 'b', createdAt: at(0) })]
    const series = bucketByDay(rows, 5, NOW)
    // окно 5 дней: индексы соответствуют «4 дня назад … сегодня»
    expect(series.map((b) => b.total)).toEqual([0, 1, 0, 0, 1])
  })

  it('раскладывает взятые и потерянные внутри дня', () => {
    const rows = [
      lead({ id: 'a', createdAt: at(1, 9), status: 'TAKEN', takenAt: at(1, 9, 2), attempts: 1 }),
      lead({ id: 'b', createdAt: at(1, 11), status: 'CLOSED', takenAt: at(1, 11, 4), attempts: 2 }),
      lead({ id: 'c', createdAt: at(1, 15), status: 'LOST', attempts: 3 }),
      lead({ id: 'd', createdAt: at(1, 18), status: 'ASSIGNED', attempts: 1 }),
    ]
    const series = bucketByDay(rows, 2, NOW)
    expect(series[0]).toEqual({ date: '2026-03-14', total: 4, taken: 2, lost: 1 })
    expect(series[1]).toEqual({ date: '2026-03-15', total: 0, taken: 0, lost: 0 })
  })

  it('игнорирует строки за пределами окна', () => {
    const rows = [lead({ id: 'old', createdAt: at(30) }), lead({ id: 'new', createdAt: at(0) })]
    const series = bucketByDay(rows, 3, NOW)
    expect(series.reduce((sum, b) => sum + b.total, 0)).toBe(1)
  })

  it('нулевое и отрицательное окно даёт пустой ряд', () => {
    expect(bucketByDay([], 0, NOW)).toEqual([])
    expect(bucketByDay([], -5, NOW)).toEqual([])
  })
})

describe('summarizeManagers', () => {
  const sent = new Date(2026, 2, 15, 10, 0, 0)

  function assignment(partial: Partial<AssignmentStatRow> & { managerId: string }): AssignmentStatRow {
    return {
      status: 'PENDING',
      sentAt: sent,
      resolvedAt: null,
      leadClosed: false,
      ...partial,
    }
  }

  it('на пустом входе отдаёт пустой список', () => {
    expect(summarizeManagers([])).toEqual([])
  })

  it('считает разрезы по статусам и закрытые заявки', () => {
    const rows: AssignmentStatRow[] = [
      assignment({ managerId: 'm1', status: 'ACCEPTED', resolvedAt: new Date(sent.getTime() + 2 * MINUTE), leadClosed: true }),
      assignment({ managerId: 'm1', status: 'ACCEPTED', resolvedAt: new Date(sent.getTime() + 4 * MINUTE), leadClosed: false }),
      assignment({ managerId: 'm1', status: 'DECLINED', resolvedAt: new Date(sent.getTime() + 6 * MINUTE) }),
      assignment({ managerId: 'm1', status: 'EXPIRED', resolvedAt: new Date(sent.getTime() + 20 * MINUTE) }),
      assignment({ managerId: 'm1', status: 'PENDING' }),
    ]
    const [stat] = summarizeManagers(rows)
    expect(stat).toEqual({
      managerId: 'm1',
      assigned: 5,
      accepted: 2,
      declined: 1,
      expired: 1,
      closed: 1,
      avgResponseMs: 4 * MINUTE, // (2 + 4 + 6) / 3, протухшее в среднее не идёт
    })
  })

  it('менеджер без единой реакции получает null вместо среднего', () => {
    const rows: AssignmentStatRow[] = [
      assignment({ managerId: 'm2', status: 'EXPIRED', resolvedAt: new Date(sent.getTime() + 20 * MINUTE) }),
      assignment({ managerId: 'm2', status: 'PENDING' }),
    ]
    const [stat] = summarizeManagers(rows)
    expect(stat.assigned).toBe(2)
    expect(stat.expired).toBe(1)
    expect(stat.avgResponseMs).toBeNull()
  })

  it('группирует по менеджерам и сохраняет порядок первого появления', () => {
    const rows: AssignmentStatRow[] = [
      assignment({ managerId: 'b' }),
      assignment({ managerId: 'a' }),
      assignment({ managerId: 'b' }),
      assignment({ managerId: 'c' }),
    ]
    const stats = summarizeManagers(rows)
    expect(stats.map((s) => s.managerId)).toEqual(['b', 'a', 'c'])
    expect(stats.map((s) => s.assigned)).toEqual([2, 1, 1])
  })
})

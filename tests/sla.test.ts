import { describe, expect, it } from 'vitest'
import {
  computeDueAt,
  formatTimeLeft,
  isChainExhausted,
  isOverdue,
  msUntilDue,
  outboxBackoffMs,
} from '../src/core/sla'

const BASE = new Date('2026-08-09T12:00:00.000Z')

describe('computeDueAt', () => {
  it('прибавляет минуты SLA', () => {
    expect(computeDueAt(BASE, 20).toISOString()).toBe('2026-08-09T12:20:00.000Z')
    expect(computeDueAt(BASE, 1).toISOString()).toBe('2026-08-09T12:01:00.000Z')
  })

  it('не трогает исходную дату', () => {
    const sent = new Date(BASE)
    computeDueAt(sent, 45)
    expect(sent.toISOString()).toBe(BASE.toISOString())
  })
})

describe('isOverdue', () => {
  const due = computeDueAt(BASE, 20)

  it('до дедлайна — не просрочено', () => {
    expect(isOverdue(due, new Date(due.getTime() - 1))).toBe(false)
  })

  it('ровно на границе — уже просрочено', () => {
    expect(isOverdue(due, new Date(due.getTime()))).toBe(true)
  })

  it('после дедлайна — просрочено', () => {
    expect(isOverdue(due, new Date(due.getTime() + 1))).toBe(true)
  })
})

describe('msUntilDue', () => {
  it('положительное до дедлайна, отрицательное после', () => {
    const due = computeDueAt(BASE, 10)
    expect(msUntilDue(due, BASE)).toBe(600_000)
    expect(msUntilDue(due, new Date(BASE.getTime() + 900_000))).toBe(-300_000)
  })
})

describe('formatTimeLeft', () => {
  const at = (offsetMs: number) => new Date(BASE.getTime() + offsetMs)

  it('целые минуты', () => {
    expect(formatTimeLeft(at(14 * 60_000), BASE)).toBe('14 мин')
  })

  it('минуты с секундами', () => {
    expect(formatTimeLeft(at(150_000), BASE)).toBe('2 мин 30 с')
  })

  it('меньше минуты', () => {
    expect(formatTimeLeft(at(59_000), BASE)).toBe('меньше минуты')
    expect(formatTimeLeft(at(1), BASE)).toBe('меньше минуты')
  })

  it('просрочка', () => {
    expect(formatTimeLeft(at(-3 * 60_000), BASE)).toBe('просрочено на 3 мин')
    expect(formatTimeLeft(at(-90_000), BASE)).toBe('просрочено на 1 мин 30 с')
  })

  it('граница и мелкая просрочка — без «на»', () => {
    expect(formatTimeLeft(BASE, BASE)).toBe('просрочено')
    expect(formatTimeLeft(at(-5_000), BASE)).toBe('просрочено')
  })
})

describe('isChainExhausted', () => {
  it('исчерпана, когда следующая попытка вышла бы за лимит', () => {
    expect(isChainExhausted(1, 3)).toBe(false)
    expect(isChainExhausted(2, 3)).toBe(false)
    expect(isChainExhausted(3, 3)).toBe(true)
    expect(isChainExhausted(4, 3)).toBe(true)
  })
})

describe('outboxBackoffMs', () => {
  it('2^attempts секунд', () => {
    expect(outboxBackoffMs(0)).toBe(1_000)
    expect(outboxBackoffMs(1)).toBe(2_000)
    expect(outboxBackoffMs(2)).toBe(4_000)
    expect(outboxBackoffMs(5)).toBe(32_000)
  })

  it('потолок — час', () => {
    expect(outboxBackoffMs(12)).toBe(3_600_000)
    expect(outboxBackoffMs(50)).toBe(3_600_000)
  })

  it('отрицательное значение не ломает арифметику', () => {
    expect(outboxBackoffMs(-3)).toBe(1_000)
  })
})

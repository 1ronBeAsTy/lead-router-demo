import { describe, expect, it } from 'vitest'
import { pickManager, rankCandidates, type RoutingCandidate } from '../src/core/routing'

function candidate(patch: Partial<RoutingCandidate> & { id: string }): RoutingCandidate {
  return {
    priority: 0,
    categories: ['Ремонт'],
    isActive: true,
    activeLeadCount: 0,
    lastAssignedAt: null,
    ...patch,
  }
}

const REPAIR = { category: 'Ремонт', excludeManagerIds: [] as string[] }

describe('pickManager: фильтрация', () => {
  it('выбирает менеджера с нужной категорией', () => {
    const list = [
      candidate({ id: 'a', categories: ['Установка'] }),
      candidate({ id: 'b', categories: ['Ремонт', 'Диагностика'] }),
    ]
    expect(pickManager(list, REPAIR)?.id).toBe('b')
  })

  it('пропускает неактивных', () => {
    const list = [
      candidate({ id: 'a', isActive: false, priority: 100 }),
      candidate({ id: 'b' }),
    ]
    expect(pickManager(list, REPAIR)?.id).toBe('b')
  })

  it('не назначает дважды одному и тому же', () => {
    const list = [candidate({ id: 'a', priority: 10 }), candidate({ id: 'b' })]
    const picked = pickManager(list, { category: 'Ремонт', excludeManagerIds: ['a'] })
    expect(picked?.id).toBe('b')
  })

  it('возвращает null, когда кандидаты исчерпаны', () => {
    const list = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    expect(pickManager(list, { category: 'Ремонт', excludeManagerIds: ['a', 'b'] })).toBeNull()
    expect(pickManager(list, { category: 'Установка', excludeManagerIds: [] })).toBeNull()
    expect(pickManager([], REPAIR)).toBeNull()
  })
})

describe('rankCandidates: порядок', () => {
  it('приоритет по убыванию важнее загрузки', () => {
    const list = [
      candidate({ id: 'low', priority: 1, activeLeadCount: 0 }),
      candidate({ id: 'high', priority: 5, activeLeadCount: 9 }),
    ]
    expect(rankCandidates(list, REPAIR).map((c) => c.id)).toEqual(['high', 'low'])
  })

  it('при равном приоритете идёт менее загруженный', () => {
    const list = [
      candidate({ id: 'busy', activeLeadCount: 3 }),
      candidate({ id: 'free', activeLeadCount: 1 }),
    ]
    expect(rankCandidates(list, REPAIR).map((c) => c.id)).toEqual(['free', 'busy'])
  })

  it('при равной загрузке первым идёт тот, кому давно не слали; null — раньше всех', () => {
    const list = [
      candidate({ id: 'recent', lastAssignedAt: new Date('2026-01-02T10:00:00Z') }),
      candidate({ id: 'never', lastAssignedAt: null }),
      candidate({ id: 'old', lastAssignedAt: new Date('2026-01-01T10:00:00Z') }),
    ]
    expect(rankCandidates(list, REPAIR).map((c) => c.id)).toEqual(['never', 'old', 'recent'])
  })

  it('полностью одинаковых разводит id — выбор детерминирован', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const list = [
      candidate({ id: 'm-c', lastAssignedAt: now }),
      candidate({ id: 'm-a', lastAssignedAt: now }),
      candidate({ id: 'm-b', lastAssignedAt: now }),
    ]
    expect(rankCandidates(list, REPAIR).map((c) => c.id)).toEqual(['m-a', 'm-b', 'm-c'])
    expect(rankCandidates([...list].reverse(), REPAIR).map((c) => c.id)).toEqual([
      'm-a',
      'm-b',
      'm-c',
    ])
  })

  it('не мутирует входной массив', () => {
    const list = [
      candidate({ id: 'b', priority: 1 }),
      candidate({ id: 'a', priority: 9 }),
    ]
    const before = list.map((c) => c.id)
    rankCandidates(list, REPAIR)
    expect(list.map((c) => c.id)).toEqual(before)
  })

  it('отфильтрованные не попадают в список', () => {
    const list = [
      candidate({ id: 'a' }),
      candidate({ id: 'b', isActive: false }),
      candidate({ id: 'c', categories: ['Другое'] }),
      candidate({ id: 'd' }),
    ]
    expect(rankCandidates(list, { category: 'Ремонт', excludeManagerIds: ['d'] })).toHaveLength(1)
  })
})

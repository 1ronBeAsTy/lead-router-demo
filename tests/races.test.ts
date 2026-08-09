import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Тексты карточек пишет другой модуль и они здесь не проверяются — подменяем рендер.
vi.mock('../src/bot/cards', async () => await import('./setup/fakeCards'))

import {
  acceptAssignment,
  assignNextAttempt,
  closeLead,
  createLead,
  declineAssignment,
  expireOverdueAssignments,
} from '../src/services/assignment'
import { LEAD_INPUT, createManager, makeFakeApi, prisma, resetDb } from './setup/db'

const fake = makeFakeApi()
const deps = { api: fake.api }

async function seedManagers() {
  const first = await createManager({ name: 'Первый', tgUserId: 101, priority: 10 })
  const second = await createManager({ name: 'Второй', tgUserId: 102, priority: 5 })
  return { first, second }
}

async function assignedLead() {
  const lead = await createLead(LEAD_INPUT)
  const outcome = await assignNextAttempt(lead.id, deps)
  if (outcome.kind !== 'assigned') throw new Error(`ожидалось назначение, получено ${outcome.kind}`)
  const manager = await prisma.manager.findUniqueOrThrow({ where: { id: outcome.managerId } })
  return { leadId: lead.id, outcome, manager }
}

beforeEach(async () => {
  await resetDb()
  fake.sent.length = 0
  fake.edited.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('гонка при принятии', () => {
  it('два одновременных «Беру» по одному назначению: ровно один выигрывает', async () => {
    await seedManagers()
    const { leadId, outcome, manager } = await assignedLead()

    const [a, b] = await Promise.all([
      acceptAssignment(outcome.assignmentId, manager.tgUserId, deps),
      acceptAssignment(outcome.assignmentId, manager.tgUserId, deps),
    ])

    const winners = [a, b].filter((r) => r.ok)
    const losers = [a, b].filter((r) => !r.ok)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(losers[0]).toMatchObject({ ok: false, reason: 'lost_race' })

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('TAKEN')
    expect(lead.takenById).toBe(manager.id)
    expect(lead.takenAt).not.toBeNull()

    // Лид ровно один раз перешёл в TAKEN — принятое назначение тоже одно.
    const accepted = await prisma.assignment.count({ where: { leadId, status: 'ACCEPTED' } })
    expect(accepted).toBe(1)
  })

  it('чужой менеджер не может принять назначение', async () => {
    const { second } = await seedManagers()
    const { outcome, manager } = await assignedLead()
    const stranger = manager.id === second.id ? 101n : 102n

    const result = await acceptAssignment(outcome.assignmentId, stranger, deps)
    expect(result).toMatchObject({ ok: false, reason: 'not_owner' })

    const assignment = await prisma.assignment.findUniqueOrThrow({
      where: { id: outcome.assignmentId },
    })
    expect(assignment.status).toBe('PENDING')
  })

  it('повторное «Беру» после принятия — lost_race', async () => {
    await seedManagers()
    const { outcome, manager } = await assignedLead()

    expect((await acceptAssignment(outcome.assignmentId, manager.tgUserId, deps)).ok).toBe(true)
    expect(await acceptAssignment(outcome.assignmentId, manager.tgUserId, deps)).toMatchObject({
      ok: false,
      reason: 'lost_race',
    })
  })
})

describe('гонка тикера против принятия', () => {
  it('заявка не теряется и не принимается дважды', async () => {
    await seedManagers()
    const { leadId, outcome, manager } = await assignedLead()

    // Дедлайн уже в прошлом: тикер и менеджер претендуют на одно назначение.
    await prisma.assignment.update({
      where: { id: outcome.assignmentId },
      data: { dueAt: new Date(Date.now() - 60_000) },
    })

    const [, accept] = await Promise.all([
      expireOverdueAssignments(deps),
      acceptAssignment(outcome.assignmentId, manager.tgUserId, deps),
    ])

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    const accepted = await prisma.assignment.count({ where: { leadId, status: 'ACCEPTED' } })
    const pending = await prisma.assignment.count({ where: { leadId, status: 'PENDING' } })

    if (accept.ok) {
      // Менеджер успел: заявка у него, тикер прошёл мимо.
      expect(lead.status).toBe('TAKEN')
      expect(accepted).toBe(1)
      expect(pending).toBe(0)
    } else {
      // Тикер успел первым: назначение отбито, заявка живёт дальше по цепочке.
      expect(accept.reason).toBe('lost_race')
      expect(accepted).toBe(0)
      expect(lead.status).toBe('ASSIGNED')
      expect(pending).toBe(1)
    }
  })

  it('после эскалации следующее назначение уходит другому менеджеру', async () => {
    await seedManagers()
    const { leadId, outcome } = await assignedLead()
    await prisma.assignment.update({
      where: { id: outcome.assignmentId },
      data: { dueAt: new Date(Date.now() - 60_000) },
    })

    const report = await expireOverdueAssignments(deps)
    expect(report).toMatchObject({ expired: 1, reassigned: 1, lost: 0 })

    const assignments = await prisma.assignment.findMany({
      where: { leadId },
      orderBy: { attempt: 'asc' },
    })
    expect(assignments).toHaveLength(2)
    expect(assignments[0].status).toBe('EXPIRED')
    expect(assignments[1].status).toBe('PENDING')
    expect(assignments[1].managerId).not.toBe(assignments[0].managerId)
  })
})

describe('параллельные попытки назначения', () => {
  it('уникальный индекс не даёт создать две попытки с одним номером', async () => {
    await seedManagers()
    const lead = await createLead(LEAD_INPUT)

    const outcomes = await Promise.all([
      assignNextAttempt(lead.id, deps),
      assignNextAttempt(lead.id, deps),
    ])

    const assigned = outcomes.filter((o) => o.kind === 'assigned')
    expect(assigned).toHaveLength(1)

    const count = await prisma.assignment.count({ where: { leadId: lead.id } })
    expect(count).toBe(1)
  })
})

describe('отказ и закрытие', () => {
  it('«Не могу» сразу передаёт заявку коллеге и не возвращает её отказавшему', async () => {
    await seedManagers()
    const { leadId, outcome, manager } = await assignedLead()

    const result = await declineAssignment(outcome.assignmentId, manager.tgUserId, deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.next.kind).toBe('assigned')

    const assignments = await prisma.assignment.findMany({
      where: { leadId },
      orderBy: { attempt: 'asc' },
    })
    expect(assignments[0].status).toBe('DECLINED')
    expect(assignments[1].status).toBe('PENDING')
    expect(assignments[1].managerId).not.toBe(manager.id)
  })

  it('закрыть может только тот, кто взял', async () => {
    const { first, second } = await seedManagers()
    const { leadId, outcome, manager } = await assignedLead()
    await acceptAssignment(outcome.assignmentId, manager.tgUserId, deps)

    const other = manager.id === first.id ? second : first
    expect(await closeLead(leadId, other.tgUserId, deps)).toMatchObject({
      ok: false,
      reason: 'not_owner',
    })

    const closed = await closeLead(leadId, manager.tgUserId, deps)
    expect(closed.ok).toBe(true)

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('CLOSED')
    expect(lead.closedAt).not.toBeNull()

    // Повторное закрытие уже не проходит — условие на статус TAKEN не выполняется.
    expect(await closeLead(leadId, manager.tgUserId, deps)).toMatchObject({
      ok: false,
      reason: 'not_taken',
    })
  })
})

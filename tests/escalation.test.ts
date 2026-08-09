import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Тексты карточек проверяются отдельно — здесь важна только механика переходов.
vi.mock('../src/bot/cards', async () => await import('./setup/fakeCards'))

import { assignNextAttempt, createLead } from '../src/services/assignment'
import { runEscalationTick } from '../src/ticker/escalate'
import {
  LEAD_INPUT,
  createManager,
  makeFakeApi,
  prisma,
  resetDb,
  setTestSettings,
} from './setup/db'

/**
 * Главная проверка шага 4: эскалация живёт в базе. Ни один тест здесь не ждёт
 * реального времени и не полагается на таймеры в процессе — `dueAt` просто
 * сдвигается в прошлое, ровно как если бы процесс всё это время лежал.
 */

const ESCALATION_CHAT = '-100500'

const fake = makeFakeApi()
const deps = { api: fake.api }

/** Эмуляция «прошло время / процесс перезапустили»: дедлайн уже позади. */
async function rewindDueAt(assignmentId: string, msAgo = 60_000): Promise<void> {
  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { dueAt: new Date(Date.now() - msAgo) },
  })
}

async function assignedLead() {
  const lead = await createLead(LEAD_INPUT)
  const outcome = await assignNextAttempt(lead.id, deps)
  if (outcome.kind !== 'assigned') throw new Error(`ожидалось назначение, получено ${outcome.kind}`)
  return { leadId: lead.id, outcome }
}

beforeEach(async () => {
  await resetDb()
  await setTestSettings({ escalationChatId: ESCALATION_CHAT, slaMinutes: '20', maxAttempts: '3' })
  fake.sent.length = 0
  fake.edited.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('эскалация переживает рестарт', () => {
  it('назначение, просроченное «пока процесс лежал», подхватывается первым же тиком', async () => {
    await createManager({ name: 'Первый', tgUserId: 201, priority: 10 })
    await createManager({ name: 'Второй', tgUserId: 202, priority: 5 })

    const { leadId, outcome } = await assignedLead()
    await rewindDueAt(outcome.assignmentId)

    // Ни одного таймера не заводилось — тик узнаёт о просрочке только из базы.
    const report = await runEscalationTick(deps)

    expect(report.expired).toBe(1)
    expect(report.reassigned).toBe(1)

    const first = await prisma.assignment.findUniqueOrThrow({ where: { id: outcome.assignmentId } })
    expect(first.status).toBe('EXPIRED')
    expect(first.resolvedAt).not.toBeNull()

    const next = await prisma.assignment.findFirstOrThrow({
      where: { leadId, status: 'PENDING' },
    })
    expect(next.attempt).toBe(2)
    expect(next.managerId).not.toBe(outcome.managerId)

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('ASSIGNED')
  })

  it('назначение с живым дедлайном тик не трогает', async () => {
    await createManager({ name: 'Первый', tgUserId: 203 })

    const { outcome } = await assignedLead()
    const report = await runEscalationTick(deps)

    expect(report.expired).toBe(0)
    const still = await prisma.assignment.findUniqueOrThrow({ where: { id: outcome.assignmentId } })
    expect(still.status).toBe('PENDING')
  })

  it('повторный тик по уже разобранному назначению ничего не делает', async () => {
    await createManager({ name: 'Первый', tgUserId: 204, priority: 10 })
    await createManager({ name: 'Второй', tgUserId: 205, priority: 5 })

    const { outcome } = await assignedLead()
    await rewindDueAt(outcome.assignmentId)

    await runEscalationTick(deps)
    const second = await runEscalationTick(deps)

    expect(second.expired).toBe(0)
    const assignments = await prisma.assignment.count()
    expect(assignments).toBe(2)
  })
})

describe('цепочка исчерпана', () => {
  it('после maxAttempts заявка уходит в LOST и о ней пишут в чат эскалации', async () => {
    await setTestSettings({ maxAttempts: '2' })
    await createManager({ name: 'Первый', tgUserId: 206, priority: 10 })
    await createManager({ name: 'Второй', tgUserId: 207, priority: 5 })

    const { leadId, outcome } = await assignedLead()

    await rewindDueAt(outcome.assignmentId)
    await runEscalationTick(deps)

    const second = await prisma.assignment.findFirstOrThrow({
      where: { leadId, status: 'PENDING' },
    })
    await rewindDueAt(second.id)
    const report = await runEscalationTick(deps)

    expect(report.lost).toBe(1)

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('LOST')
    expect(lead.lostAt).not.toBeNull()

    // Третьего назначения быть не должно: лимит — две попытки.
    expect(await prisma.assignment.count({ where: { leadId } })).toBe(2)
    expect(await prisma.assignment.count({ where: { leadId, status: 'PENDING' } })).toBe(0)

    expect(fake.sentTo(ESCALATION_CHAT)).toHaveLength(1)
  })

  it('если подходящих менеджеров нет вовсе, заявка теряется сразу', async () => {
    await createManager({ name: 'Не тот профиль', tgUserId: 208, categories: ['Установка'] })

    const lead = await createLead(LEAD_INPUT) // категория «Ремонт»
    const outcome = await assignNextAttempt(lead.id, deps)

    expect(outcome).toEqual({ kind: 'lost', reason: 'no_candidates' })

    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })
    expect(saved.status).toBe('LOST')
    expect(fake.sentTo(ESCALATION_CHAT)).toHaveLength(1)
  })

  it('кандидаты кончились раньше лимита попыток — тоже LOST', async () => {
    await setTestSettings({ maxAttempts: '5' })
    await createManager({ name: 'Единственный', tgUserId: 209 })

    const { leadId, outcome } = await assignedLead()
    await rewindDueAt(outcome.assignmentId)

    const report = await runEscalationTick(deps)

    expect(report.lost).toBe(1)
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('LOST')
  })
})

describe('эскалация и уже решённые заявки', () => {
  it('взятая заявка не переназначается, даже если старое назначение просрочено', async () => {
    await createManager({ name: 'Первый', tgUserId: 210, priority: 10 })
    await createManager({ name: 'Второй', tgUserId: 211, priority: 5 })

    const { leadId, outcome } = await assignedLead()

    // Менеджер принял — назначение уже не PENDING, тику брать нечего.
    await prisma.assignment.update({
      where: { id: outcome.assignmentId },
      data: { status: 'ACCEPTED', resolvedAt: new Date() },
    })
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'TAKEN', takenById: outcome.managerId, takenAt: new Date() },
    })
    await rewindDueAt(outcome.assignmentId)

    const report = await runEscalationTick(deps)

    expect(report.expired).toBe(0)
    expect(await prisma.assignment.count({ where: { leadId } })).toBe(1)
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('TAKEN')
  })
})

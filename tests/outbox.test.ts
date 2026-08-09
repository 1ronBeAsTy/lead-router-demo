import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Sheets — внешняя система, и в тестах она нам нужна управляемой: важно не то,
 * что попадёт в таблицу, а что очередь корректно переживает её отказы.
 */
const upsertLeadRow = vi.fn<(leadId: string) => Promise<void>>()
vi.mock('../src/sheets/client', () => ({
  upsertLeadRow: (leadId: string) => upsertLeadRow(leadId),
  isSheetsConfigured: async () => true,
}))

vi.mock('../src/bot/cards', async () => await import('./setup/fakeCards'))

import { createLead } from '../src/services/assignment'
import { enqueueLeadSync } from '../src/services/outbox'
import { MAX_OUTBOX_ATTEMPTS, runOutboxTick } from '../src/ticker/outbox'
import { LEAD_INPUT, prisma, resetDb } from './setup/db'

async function queuedJobForLead() {
  const lead = await createLead(LEAD_INPUT)
  // createLead уже ставит задание в той же транзакции — берём именно его.
  const job = await prisma.outboxJob.findFirstOrThrow({ where: { status: 'QUEUED' } })
  return { leadId: lead.id, job }
}

beforeEach(async () => {
  await resetDb()
  upsertLeadRow.mockReset()
  upsertLeadRow.mockResolvedValue(undefined)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('транзакционный outbox', () => {
  it('заявка и задание на выгрузку создаются вместе', async () => {
    const { leadId } = await queuedJobForLead()

    const jobs = await prisma.outboxJob.findMany()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].kind).toBe('sheets.lead.upsert')
    expect(jobs[0].payload).toEqual({ leadId })
  })

  it('успешная доставка переводит задание в SENT', async () => {
    const { leadId } = await queuedJobForLead()

    const report = await runOutboxTick()

    expect(report).toMatchObject({ claimed: 1, sent: 1, retried: 0, failed: 0 })
    expect(upsertLeadRow).toHaveBeenCalledWith(leadId)

    const job = await prisma.outboxJob.findFirstOrThrow()
    expect(job.status).toBe('SENT')
    expect(job.sentAt).not.toBeNull()
    expect(job.lastError).toBeNull()
  })
})

describe('ретраи при отказе внешней системы', () => {
  it('падение увеличивает attempts, отодвигает nextRunAt и сохраняет причину', async () => {
    await queuedJobForLead()
    upsertLeadRow.mockRejectedValue(new Error('Google говорит 429'))

    const now = new Date()
    const report = await runOutboxTick(now)

    expect(report).toMatchObject({ claimed: 1, sent: 0, retried: 1, failed: 0 })

    const job = await prisma.outboxJob.findFirstOrThrow()
    expect(job.status).toBe('QUEUED')
    expect(job.attempts).toBe(1)
    expect(job.lastError).toContain('429')
    // 2^1 секунды backoff — задание не должно взяться тем же тиком снова.
    expect(job.nextRunAt.getTime()).toBeGreaterThan(now.getTime())
  })

  it('отложенное задание не берётся, пока не наступил nextRunAt', async () => {
    await queuedJobForLead()
    upsertLeadRow.mockRejectedValue(new Error('сеть отвалилась'))

    const now = new Date()
    await runOutboxTick(now)
    upsertLeadRow.mockResolvedValue(undefined)

    const tooEarly = await runOutboxTick(new Date(now.getTime() + 500))
    expect(tooEarly.claimed).toBe(0)

    const later = await runOutboxTick(new Date(now.getTime() + 10_000))
    expect(later.sent).toBe(1)
  })

  it(`после ${MAX_OUTBOX_ATTEMPTS} неудач задание уходит в FAILED и больше не мешает очереди`, async () => {
    await queuedJobForLead()
    upsertLeadRow.mockRejectedValue(new Error('стабильно падает'))

    let clock = Date.now()
    for (let i = 0; i < MAX_OUTBOX_ATTEMPTS; i += 1) {
      await runOutboxTick(new Date(clock))
      clock += 60 * 60 * 1000 // с запасом перекрывает любой backoff
    }

    const job = await prisma.outboxJob.findFirstOrThrow()
    expect(job.status).toBe('FAILED')
    expect(job.attempts).toBe(MAX_OUTBOX_ATTEMPTS)

    const after = await runOutboxTick(new Date(clock))
    expect(after.claimed).toBe(0)
  })

  it('неизвестный kind не роняет тик, а уходит в ретрай', async () => {
    await prisma.outboxJob.create({
      data: { kind: 'нет.такого.обработчика', payload: {}, nextRunAt: new Date() },
    })

    const report = await runOutboxTick()

    expect(report.retried).toBe(1)
    const job = await prisma.outboxJob.findFirstOrThrow()
    expect(job.lastError).toContain('нет.такого.обработчика')
  })
})

describe('два воркера', () => {
  it('параллельные тики не берут одно задание дважды', async () => {
    await queuedJobForLead()

    let inFlight = 0
    let maxInFlight = 0
    upsertLeadRow.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 30))
      inFlight -= 1
    })

    const now = new Date()
    const [a, b] = await Promise.all([runOutboxTick(now), runOutboxTick(now)])

    expect(a.claimed + b.claimed).toBe(1)
    expect(upsertLeadRow).toHaveBeenCalledTimes(1)
    expect(maxInFlight).toBe(1)
  })

  it('аренда захваченного задания видна второму воркеру как «занято»', async () => {
    await queuedJobForLead()
    await prisma.outboxJob.updateMany({ data: { nextRunAt: new Date(Date.now() + 60_000) } })

    const report = await runOutboxTick()

    expect(report.claimed).toBe(0)
    expect(upsertLeadRow).not.toHaveBeenCalled()
  })
})

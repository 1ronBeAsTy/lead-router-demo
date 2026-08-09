import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client'
import { outboxBackoffMs } from '../core/sla'
import { OUTBOX_KINDS } from '../services/outbox'
import { upsertLeadRow } from '../sheets/client'
import { createLogger } from '../lib/logger'

/**
 * Доставка outbox-заданий во внешние системы (сейчас — Google Sheets).
 *
 * Задание захватывается атомарно: `updateMany` с условием `status: QUEUED`
 * и `nextRunAt <= now` сдвигает `nextRunAt` в будущее (аренда). Второй воркер,
 * даже если успел прочитать ту же строку, получит `count === 0` и пройдёт мимо.
 * Отдельного статуса «в работе» в схеме нет, поэтому аренда живёт в `nextRunAt`.
 */

const log = createLogger('ticker:outbox')

/** Сколько заданий разбираем за тик. */
const BATCH = 20
/** После стольких неудач задание уходит в FAILED и больше не мешает очереди. */
export const MAX_OUTBOX_ATTEMPTS = 5
/** На сколько задание считается «занятым» захватившим воркером. */
const LEASE_MS = 60_000

export interface OutboxReport {
  claimed: number
  sent: number
  retried: number
  failed: number
}

type Handler = (payload: Record<string, unknown>) => Promise<void>

const HANDLERS: Record<string, Handler> = {
  [OUTBOX_KINDS.LEAD_UPSERT]: async (payload) => {
    const leadId = payload.leadId
    if (typeof leadId !== 'string' || leadId.length === 0) {
      throw new Error('payload.leadId отсутствует или не строка')
    }
    await upsertLeadRow(leadId)
  },
}

function asPayload(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runOutboxTick(now: Date = new Date()): Promise<OutboxReport> {
  const report: OutboxReport = { claimed: 0, sent: 0, retried: 0, failed: 0 }

  const due = await prisma.outboxJob.findMany({
    where: { status: 'QUEUED', nextRunAt: { lte: now } },
    orderBy: { nextRunAt: 'asc' },
    take: BATCH,
  })

  for (const job of due) {
    const lease = await prisma.outboxJob.updateMany({
      where: { id: job.id, status: 'QUEUED', nextRunAt: { lte: now } },
      data: { nextRunAt: new Date(now.getTime() + LEASE_MS) },
    })
    // Задание уже забрал другой воркер (или другой тик этого же процесса).
    if (lease.count === 0) continue
    report.claimed += 1

    const handler = HANDLERS[job.kind]

    try {
      if (!handler) throw new Error(`неизвестный kind: ${job.kind}`)
      await handler(asPayload(job.payload))
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      })
      report.sent += 1
    } catch (error) {
      const attempts = job.attempts + 1
      const exhausted = attempts >= MAX_OUTBOX_ATTEMPTS
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          attempts,
          status: exhausted ? 'FAILED' : 'QUEUED',
          lastError: describe(error).slice(0, 500),
          nextRunAt: new Date(now.getTime() + outboxBackoffMs(attempts)),
        },
      })
      if (exhausted) {
        report.failed += 1
        log.error('Задание окончательно провалено', { id: job.id, kind: job.kind, attempts, error })
      } else {
        report.retried += 1
        log.warn('Задание отложено', { id: job.id, kind: job.kind, attempts, error })
      }
    }
  }

  if (report.claimed > 0) log.info('Outbox', report)
  return report
}

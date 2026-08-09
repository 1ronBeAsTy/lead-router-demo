import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client'

/**
 * Транзакционный outbox. Задание пишется в ту же транзакцию, что и бизнес-строка:
 * либо есть и заявка, и задание на её выгрузку, либо нет ни того, ни другого.
 * Никаких «сохранил лид, а потом упал до отправки в Sheets».
 */

/** Клиент внутри `$transaction` умеет то же самое, что и обычный. */
export type DbClient = Prisma.TransactionClient | typeof prisma

export const OUTBOX_KINDS = {
  /** payload: `{ leadId: string }` */
  LEAD_UPSERT: 'sheets.lead.upsert',
} as const

export type OutboxKind = (typeof OUTBOX_KINDS)[keyof typeof OUTBOX_KINDS]

export async function enqueue(
  kind: string,
  payload: Prisma.InputJsonValue,
  tx?: DbClient,
): Promise<{ id: string }> {
  const db = tx ?? prisma
  // `nextRunAt` проставляем явно, часами приложения. Дефолт схемы взял бы now()
  // сервера базы, а тикер сравнивает с `new Date()` у себя — при расхождении
  // часов (в докере это обычные сотни миллисекунд) свежее задание оказывается
  // «в будущем» и молча пропускает тик.
  return db.outboxJob.create({
    data: { kind, payload, nextRunAt: new Date() },
    select: { id: true },
  })
}

/** Выгрузить строку заявки в Google Sheets. */
export async function enqueueLeadSync(leadId: string, tx?: DbClient): Promise<{ id: string }> {
  return enqueue(OUTBOX_KINDS.LEAD_UPSERT, { leadId }, tx)
}

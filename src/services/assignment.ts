import type { Api } from 'grammy'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/client'
import { getSettings } from '../config/settings'
import { pickManager, type RoutingCandidate } from '../core/routing'
import { computeDueAt } from '../core/sla'
import { enqueueLeadSync } from './outbox'
import { createLogger } from '../lib/logger'
import {
  renderAssignmentCard,
  renderClientTakenNotice,
  renderClosedCard,
  renderDeclinedCard,
  renderExpiredCard,
  renderLostNotice,
  renderTakenCard,
  type Card,
  type LeadCardData,
} from '../bot/cards'

/**
 * Оркестрация жизненного цикла заявки. Единственный слой, который трогает и
 * базу, и Telegram. Бот и тикер вызывают только эти функции.
 *
 * КОНТРАКТ — сигнатуры менять нельзя, на них завязаны src/bot и src/ticker.
 *
 * Два железных правила (см. раздел 0 плана):
 *  1. Никаких `setTimeout` — дедлайн живёт в `Assignment.dueAt`.
 *  2. Любой переход статуса — через `updateMany` с условием на текущий статус.
 *     Никогда «прочитал → проверил в коде → записал».
 */

const log = createLogger('assignment')

/** Сколько просроченных назначений разбираем за один тик. */
const EXPIRE_BATCH = 50

export interface Deps {
  api: Api
}

export interface NewLeadInput {
  contactTgId: bigint
  contactName: string
  contactUser?: string | null
  contactPhone?: string | null
  category: string
  urgency: string
  answers: Record<string, unknown>
  comment?: string | null
}

export type AssignOutcome =
  | { kind: 'assigned'; assignmentId: string; managerId: string; attempt: number; dueAt: Date }
  | { kind: 'lost'; reason: 'no_candidates' | 'max_attempts' }
  | { kind: 'noop'; reason: 'already_resolved' }

// ─────────────────────────────── вспомогательное ───────────────────────────────

type LeadRow = {
  id: string
  createdAt: Date
  contactName: string
  contactUser: string | null
  contactPhone: string | null
  category: string
  urgency: string
  comment: string | null
}

function toCardData(lead: LeadRow): LeadCardData {
  return {
    id: lead.id,
    createdAt: lead.createdAt,
    contactName: lead.contactName,
    contactUser: lead.contactUser,
    contactPhone: lead.contactPhone,
    category: lead.category,
    urgency: lead.urgency,
    comment: lead.comment,
  }
}

/** Уникальный индекс `@@unique([leadId, attempt])` — защита от двойного назначения. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * Telegram — внешняя система: она может лежать, а заявка от этого потеряться
 * не должна. Поэтому любая отправка/редактирование обёрнуты и только логируются.
 * Рендер карточек тоже внутри: сломанный шаблон не имеет права уронить тикер.
 */
async function safeTelegram<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    log.warn(`Telegram: ${what} не удалось`, { error })
    return null
  }
}

interface SentMessage {
  chatId: bigint
  messageId: number
}

async function sendCard(
  api: Api,
  chatId: bigint | string,
  build: () => Card,
  what: string,
): Promise<SentMessage | null> {
  return safeTelegram(what, async () => {
    const card = build()
    const message = await api.sendMessage(String(chatId), card.text, {
      reply_markup: card.keyboard,
      parse_mode: 'HTML',
    })
    return { chatId: BigInt(message.chat.id), messageId: message.message_id }
  })
}

async function replaceCard(
  api: Api,
  target: { chatId: bigint | null; messageId: number | null },
  build: () => Card,
  what: string,
): Promise<void> {
  const { chatId, messageId } = target
  if (chatId === null || messageId === null) return
  await safeTelegram(what, async () => {
    const card = build()
    return api.editMessageText(String(chatId), messageId, card.text, {
      reply_markup: card.keyboard,
      parse_mode: 'HTML',
    })
  })
}

/**
 * Кандидаты для маршрутизации: активные менеджеры + их текущая загрузка.
 * `activeLeadCount` = висящие PENDING-назначения + взятые в работу лиды.
 */
async function loadCandidates(): Promise<RoutingCandidate[]> {
  const [managers, pending, taken, lastSent] = await Promise.all([
    prisma.manager.findMany({ where: { isActive: true } }),
    prisma.assignment.groupBy({
      by: ['managerId'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['takenById'],
      where: { status: 'TAKEN', takenById: { not: null } },
      _count: { _all: true },
    }),
    prisma.assignment.groupBy({ by: ['managerId'], _max: { sentAt: true } }),
  ])

  const pendingBy = new Map(pending.map((r) => [r.managerId, r._count._all]))
  const takenBy = new Map(taken.map((r) => [r.takenById as string, r._count._all]))
  const lastBy = new Map(lastSent.map((r) => [r.managerId, r._max.sentAt]))

  return managers.map((m) => ({
    id: m.id,
    priority: m.priority,
    categories: m.categories,
    isActive: m.isActive,
    activeLeadCount: (pendingBy.get(m.id) ?? 0) + (takenBy.get(m.id) ?? 0),
    lastAssignedAt: lastBy.get(m.id) ?? null,
  }))
}

// ─────────────────────────────────── создание ───────────────────────────────────

/**
 * Создаёт заявку и в той же транзакции ставит задание в outbox.
 * Отправку менеджеру НЕ делает — это `assignNextAttempt`.
 */
export async function createLead(input: NewLeadInput): Promise<{ id: string }> {
  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        contactTgId: input.contactTgId,
        contactName: input.contactName,
        contactUser: input.contactUser ?? null,
        contactPhone: input.contactPhone ?? null,
        category: input.category,
        urgency: input.urgency,
        answers: input.answers as Prisma.InputJsonValue,
        comment: input.comment ?? null,
        status: 'NEW',
      },
      select: { id: true },
    })
    // Одна транзакция с лидом: либо есть и заявка, и задание на выгрузку, либо ничего.
    await enqueueLeadSync(created.id, tx)
    return created
  })

  log.info('Заявка создана', { leadId: lead.id, category: input.category })
  return { id: lead.id }
}

// ────────────────────────────────── назначение ──────────────────────────────────

/**
 * Следующая попытка по заявке: выбрать менеджера, создать `Assignment`
 * с `dueAt`, перевести лид в `ASSIGNED`, отправить карточку.
 * Если кандидатов нет или попытки кончились — `LOST` + уведомление в
 * `escalationChatId`.
 */
export async function assignNextAttempt(leadId: string, deps: Deps): Promise<AssignOutcome> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { assignments: { select: { attempt: true, managerId: true } } },
  })
  if (!lead) return { kind: 'noop', reason: 'already_resolved' }
  if (lead.status === 'TAKEN' || lead.status === 'CLOSED' || lead.status === 'LOST') {
    return { kind: 'noop', reason: 'already_resolved' }
  }

  const settings = await getSettings()
  const attempt = lead.assignments.reduce((max, a) => Math.max(max, a.attempt), 0) + 1

  if (attempt > settings.maxAttempts) {
    await markLeadLost(leadId, 'max_attempts', deps)
    return { kind: 'lost', reason: 'max_attempts' }
  }

  const excludeManagerIds = [...new Set(lead.assignments.map((a) => a.managerId))]
  const picked = pickManager(await loadCandidates(), {
    category: lead.category,
    excludeManagerIds,
  })
  if (!picked) {
    await markLeadLost(leadId, 'no_candidates', deps)
    return { kind: 'lost', reason: 'no_candidates' }
  }

  const manager = await prisma.manager.findUnique({ where: { id: picked.id } })
  if (!manager) return { kind: 'noop', reason: 'already_resolved' }

  const now = new Date()
  const dueAt = computeDueAt(now, settings.slaMinutes)

  let assignment: { id: string } | null = null
  try {
    assignment = await prisma.$transaction(async (tx) => {
      // Условный апдейт вместо «прочитал статус → проверил → записал»: если в этот
      // самый момент кто-то принял заявку, count будет 0 и назначения не появится.
      const moved = await tx.lead.updateMany({
        where: { id: leadId, status: { in: ['NEW', 'ASSIGNED'] } },
        data: { status: 'ASSIGNED' },
      })
      if (moved.count === 0) return null

      return tx.assignment.create({
        data: { leadId, managerId: manager.id, attempt, sentAt: now, dueAt },
        select: { id: true },
      })
    })
  } catch (error) {
    // Параллельный вызов уже создал попытку с тем же номером — уникальный индекс
    // ловит гонку там, где приложение её проверить не может.
    if (isUniqueViolation(error)) {
      log.debug('Попытка уже создана параллельно', { leadId, attempt })
      return { kind: 'noop', reason: 'already_resolved' }
    }
    throw error
  }

  if (!assignment) return { kind: 'noop', reason: 'already_resolved' }
  const created = assignment

  const sent = await sendCard(
    deps.api,
    manager.tgUserId,
    () =>
      renderAssignmentCard(toCardData(lead), {
        assignmentId: created.id,
        attempt,
        maxAttempts: settings.maxAttempts,
        dueAt,
        now,
      }),
    'отправка карточки менеджеру',
  )

  if (sent) {
    await prisma.assignment.update({
      where: { id: created.id },
      data: { chatId: sent.chatId, messageId: sent.messageId },
    })
  }

  log.info('Заявка назначена', {
    leadId,
    assignmentId: created.id,
    managerId: manager.id,
    attempt,
    dueAt: dueAt.toISOString(),
  })

  return { kind: 'assigned', assignmentId: created.id, managerId: manager.id, attempt, dueAt }
}

// ─────────────────────────────────── «Беру» ────────────────────────────────────

export type AcceptResult =
  | { ok: true; leadId: string; managerName: string; takenAt: Date }
  | { ok: false; reason: 'lost_race' | 'not_found' | 'not_owner' }

/** «Беру». Гонка разрешается `updateMany where status: PENDING`. */
export async function acceptAssignment(
  assignmentId: string,
  tgUserId: bigint,
  deps: Deps,
): Promise<AcceptResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { manager: true, lead: true },
  })
  if (!assignment) return { ok: false, reason: 'not_found' }
  if (assignment.manager.tgUserId !== tgUserId) return { ok: false, reason: 'not_owner' }

  const takenAt = new Date()

  // Единственная точка разрешения гонки: победитель тот, чей updateMany вернул 1.
  const claimed = await prisma.assignment.updateMany({
    where: { id: assignmentId, status: 'PENDING' },
    data: { status: 'ACCEPTED', resolvedAt: takenAt },
  })
  if (claimed.count === 0) return { ok: false, reason: 'lost_race' }

  const leadTaken = await prisma.lead.updateMany({
    where: { id: assignment.leadId, status: 'ASSIGNED' },
    data: { status: 'TAKEN', takenById: assignment.managerId, takenAt },
  })
  if (leadTaken.count === 0) {
    // Назначение мы захватили, но лид уже не в игре — откатываем захват,
    // иначе в статистике останется «принято», которого не было.
    await prisma.assignment.updateMany({
      where: { id: assignmentId, status: 'ACCEPTED' },
      data: { status: 'EXPIRED' },
    })
    return { ok: false, reason: 'lost_race' }
  }

  const card = toCardData(assignment.lead)

  await replaceCard(
    deps.api,
    { chatId: assignment.chatId, messageId: assignment.messageId },
    () => renderTakenCard(card, { managerName: assignment.manager.name, takenAt }),
    'обновление карточки на «взято»',
  )

  await safeTelegram('уведомление клиента о принятии', () =>
    deps.api.sendMessage(
      String(assignment.lead.contactTgId),
      renderClientTakenNotice(assignment.manager.name),
      { parse_mode: 'HTML' },
    ),
  )

  await enqueueLeadSync(assignment.leadId)

  log.info('Заявка принята', {
    leadId: assignment.leadId,
    assignmentId,
    managerId: assignment.managerId,
  })

  return {
    ok: true,
    leadId: assignment.leadId,
    managerName: assignment.manager.name,
    takenAt,
  }
}

// ────────────────────────────────── «Не могу» ──────────────────────────────────

export type DeclineResult =
  | { ok: true; leadId: string; next: AssignOutcome }
  | { ok: false; reason: 'lost_race' | 'not_found' | 'not_owner' }

/** «Не могу» — `DECLINED` и немедленно следующая попытка. */
export async function declineAssignment(
  assignmentId: string,
  tgUserId: bigint,
  deps: Deps,
): Promise<DeclineResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { manager: true, lead: true },
  })
  if (!assignment) return { ok: false, reason: 'not_found' }
  if (assignment.manager.tgUserId !== tgUserId) return { ok: false, reason: 'not_owner' }

  const declined = await prisma.assignment.updateMany({
    where: { id: assignmentId, status: 'PENDING' },
    data: { status: 'DECLINED', resolvedAt: new Date() },
  })
  if (declined.count === 0) return { ok: false, reason: 'lost_race' }

  await replaceCard(
    deps.api,
    { chatId: assignment.chatId, messageId: assignment.messageId },
    () => renderDeclinedCard(toCardData(assignment.lead)),
    'обновление карточки на «отказ»',
  )

  log.info('Отказ менеджера', {
    leadId: assignment.leadId,
    assignmentId,
    managerId: assignment.managerId,
  })

  const next = await assignNextAttempt(assignment.leadId, deps)
  return { ok: true, leadId: assignment.leadId, next }
}

// ─────────────────────────────────── «Закрыл» ──────────────────────────────────

export type CloseResult =
  | { ok: true; leadId: string; closedAt: Date; managerName: string }
  | { ok: false; reason: 'not_taken' | 'not_found' | 'not_owner' }

/** «Закрыл» — только тот менеджер, который взял. */
export async function closeLead(
  leadId: string,
  tgUserId: bigint,
  deps: Deps,
): Promise<CloseResult> {
  const [lead, manager] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.manager.findUnique({ where: { tgUserId } }),
  ])
  if (!lead) return { ok: false, reason: 'not_found' }
  if (!manager) return { ok: false, reason: 'not_owner' }

  const closedAt = new Date()
  const closed = await prisma.lead.updateMany({
    where: { id: leadId, status: 'TAKEN', takenById: manager.id },
    data: { status: 'CLOSED', closedAt },
  })
  if (closed.count === 0) {
    // Разбираем причину только для текста ответа — решение уже принято апдейтом.
    if (lead.takenById && lead.takenById !== manager.id) return { ok: false, reason: 'not_owner' }
    return { ok: false, reason: 'not_taken' }
  }

  const accepted = await prisma.assignment.findFirst({
    where: { leadId, status: 'ACCEPTED' },
    orderBy: { attempt: 'desc' },
  })
  if (accepted) {
    await replaceCard(
      deps.api,
      { chatId: accepted.chatId, messageId: accepted.messageId },
      () => renderClosedCard(toCardData(lead), { managerName: manager.name, closedAt }),
      'обновление карточки на «закрыто»',
    )
  }

  await enqueueLeadSync(leadId)
  log.info('Заявка закрыта', { leadId, managerId: manager.id })

  return { ok: true, leadId, closedAt, managerName: manager.name }
}

// ─────────────────────────────────── эскалация ─────────────────────────────────

export interface ExpireReport {
  expired: number
  reassigned: number
  lost: number
}

/**
 * Один проход тикера: забрать просроченные `PENDING`, атомарно пометить
 * `EXPIRED`, для каждой отбитой — следующая попытка.
 * `now` инжектится ради тестов.
 */
export async function expireOverdueAssignments(deps: Deps, now?: Date): Promise<ExpireReport> {
  const at = now ?? new Date()
  const report: ExpireReport = { expired: 0, reassigned: 0, lost: 0 }

  // Дедлайн лежит в базе, поэтому просроченные находятся после любого рестарта.
  const overdue = await prisma.assignment.findMany({
    where: { status: 'PENDING', dueAt: { lte: at } },
    orderBy: { dueAt: 'asc' },
    take: EXPIRE_BATCH,
    include: { lead: true },
  })

  for (const assignment of overdue) {
    const expired = await prisma.assignment.updateMany({
      where: { id: assignment.id, status: 'PENDING' },
      data: { status: 'EXPIRED', resolvedAt: at },
    })
    // count === 0 — менеджер успел ответить в ту же секунду, заявка не наша.
    if (expired.count === 0) continue

    report.expired += 1

    await replaceCard(
      deps.api,
      { chatId: assignment.chatId, messageId: assignment.messageId },
      () => renderExpiredCard(toCardData(assignment.lead), { attempt: assignment.attempt }),
      'обновление карточки на «время вышло»',
    )

    const outcome = await assignNextAttempt(assignment.leadId, deps)
    if (outcome.kind === 'assigned') report.reassigned += 1
    else if (outcome.kind === 'lost') report.lost += 1
  }

  if (report.expired > 0) log.info('Эскалация', report)
  return report
}

/** Пометить заявку потерянной и написать в чат эскалации. */
export async function markLeadLost(
  leadId: string,
  reason: 'no_candidates' | 'max_attempts',
  deps: Deps,
): Promise<void> {
  const lostAt = new Date()
  const lost = await prisma.lead.updateMany({
    where: { id: leadId, status: { in: ['NEW', 'ASSIGNED'] } },
    data: { status: 'LOST', lostAt },
  })
  if (lost.count === 0) return

  await enqueueLeadSync(leadId)

  const settings = await getSettings()
  log.warn('Заявка потеряна', { leadId, reason })

  if (!settings.escalationChatId) return

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { _count: { select: { assignments: true } } },
  })
  if (!lead) return

  await sendCard(
    deps.api,
    settings.escalationChatId,
    () => renderLostNotice(toCardData(lead), { attempts: lead._count.assignments, reason }),
    'уведомление в чат эскалации',
  )
}

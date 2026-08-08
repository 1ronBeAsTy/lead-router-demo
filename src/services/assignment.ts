import type { Api } from 'grammy'

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

/**
 * Создаёт заявку и в той же транзакции ставит задание в outbox.
 * Отправку менеджеру НЕ делает — это `assignNextAttempt`.
 */
export async function createLead(input: NewLeadInput): Promise<{ id: string }> {
  throw new Error('TODO: реализовать в шаге 3')
}

/**
 * Следующая попытка по заявке: выбрать менеджера, создать `Assignment`
 * с `dueAt`, перевести лид в `ASSIGNED`, отправить карточку.
 * Если кандидатов нет или попытки кончились — `LOST` + уведомление в
 * `escalationChatId`.
 */
export async function assignNextAttempt(leadId: string, deps: Deps): Promise<AssignOutcome> {
  throw new Error('TODO: реализовать в шаге 3')
}

export type AcceptResult =
  | { ok: true; leadId: string; managerName: string; takenAt: Date }
  | { ok: false; reason: 'lost_race' | 'not_found' | 'not_owner' }

/** «Беру». Гонка разрешается `updateMany where status: PENDING`. */
export async function acceptAssignment(
  assignmentId: string,
  tgUserId: bigint,
  deps: Deps,
): Promise<AcceptResult> {
  throw new Error('TODO: реализовать в шаге 3')
}

export type DeclineResult =
  | { ok: true; leadId: string; next: AssignOutcome }
  | { ok: false; reason: 'lost_race' | 'not_found' | 'not_owner' }

/** «Не могу» — `DECLINED` и немедленно следующая попытка. */
export async function declineAssignment(
  assignmentId: string,
  tgUserId: bigint,
  deps: Deps,
): Promise<DeclineResult> {
  throw new Error('TODO: реализовать в шаге 3')
}

export type CloseResult =
  | { ok: true; leadId: string; closedAt: Date; managerName: string }
  | { ok: false; reason: 'not_taken' | 'not_found' | 'not_owner' }

/** «Закрыл» — только тот менеджер, который взял. */
export async function closeLead(
  leadId: string,
  tgUserId: bigint,
  deps: Deps,
): Promise<CloseResult> {
  throw new Error('TODO: реализовать в шаге 3')
}

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
  throw new Error('TODO: реализовать в шаге 4')
}

/** Пометить заявку потерянной и написать в чат эскалации. */
export async function markLeadLost(
  leadId: string,
  reason: 'no_candidates' | 'max_attempts',
  deps: Deps,
): Promise<void> {
  throw new Error('TODO: реализовать в шаге 4')
}

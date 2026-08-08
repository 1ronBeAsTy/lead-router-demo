import type { InlineKeyboard } from 'grammy'

/**
 * Карточки — чистый рендер. Ни базы, ни сети: функции возвращают текст и
 * клавиатуру, отправляет их вызывающий. Так `src/services` может рисовать
 * карточку, не импортируя обработчики бота (иначе получился бы цикл).
 *
 * КОНТРАКТ — сигнатуры менять нельзя, их зовёт src/services/assignment.ts.
 */

export interface LeadCardData {
  id: string
  createdAt: Date
  contactName: string
  contactUser: string | null
  contactPhone: string | null
  category: string
  urgency: string
  comment: string | null
}

export interface Card {
  text: string
  keyboard?: InlineKeyboard
}

export interface AssignmentCardOptions {
  assignmentId: string
  attempt: number
  maxAttempts: number
  dueAt: Date
  now?: Date
}

/** Карточка с кнопками «Беру» / «Не могу». */
export function renderAssignmentCard(lead: LeadCardData, options: AssignmentCardOptions): Card {
  throw new Error('TODO: реализовать в шаге 3')
}

/** «Взял: Иван, 14:32» + кнопка «Закрыл». Кнопки принятия убраны. */
export function renderTakenCard(
  lead: LeadCardData,
  options: { managerName: string; takenAt: Date },
): Card {
  throw new Error('TODO: реализовать в шаге 3')
}

/** «Время вышло, заявка ушла дальше». Без кнопок. */
export function renderExpiredCard(lead: LeadCardData, options: { attempt: number }): Card {
  throw new Error('TODO: реализовать в шаге 4')
}

/** «Вы отказались, заявка ушла коллеге». Без кнопок. */
export function renderDeclinedCard(lead: LeadCardData): Card {
  throw new Error('TODO: реализовать в шаге 3')
}

export function renderClosedCard(
  lead: LeadCardData,
  options: { managerName: string; closedAt: Date },
): Card {
  throw new Error('TODO: реализовать в шаге 3')
}

/** Сообщение в чат эскалации, когда цепочка исчерпана. */
export function renderLostNotice(
  lead: LeadCardData,
  options: { attempts: number; reason: 'no_candidates' | 'max_attempts' },
): Card {
  throw new Error('TODO: реализовать в шаге 4')
}

/** Что уходит клиенту, когда его заявку взяли. */
export function renderClientTakenNotice(managerName: string): string {
  throw new Error('TODO: реализовать в шаге 3')
}

/** Сводка перед отправкой — экран подтверждения в анкете. */
export function renderLeadSummary(lead: Omit<LeadCardData, 'id' | 'createdAt'>): string {
  throw new Error('TODO: реализовать в шаге 2')
}

import type {
  AssignmentCardOptions,
  Card,
  LeadCardData,
} from '../../src/bot/cards'

/**
 * Заглушка рендера карточек для интеграционных тестов.
 *
 * Тесты проверяют маршрутизацию и гонки, а не тексты; настоящий `src/bot/cards.ts`
 * пишется отдельно и на момент прогона может быть ещё стабом, который бросает.
 * Подменяем модуль целиком через `vi.mock`.
 */

export function renderAssignmentCard(lead: LeadCardData, options: AssignmentCardOptions): Card {
  return { text: `Заявка ${lead.id} · попытка ${options.attempt}` }
}

export function renderTakenCard(
  lead: LeadCardData,
  options: { managerName: string; takenAt: Date },
): Card {
  return { text: `Взял: ${options.managerName} · ${lead.id}` }
}

export function renderExpiredCard(lead: LeadCardData, options: { attempt: number }): Card {
  return { text: `Время вышло · ${lead.id} · попытка ${options.attempt}` }
}

export function renderDeclinedCard(lead: LeadCardData): Card {
  return { text: `Отказ · ${lead.id}` }
}

export function renderClosedCard(
  lead: LeadCardData,
  options: { managerName: string; closedAt: Date },
): Card {
  return { text: `Закрыл ${options.managerName} · ${lead.id}` }
}

export function renderLostNotice(
  lead: LeadCardData,
  options: { attempts: number; reason: 'no_candidates' | 'max_attempts' },
): Card {
  return { text: `Заявка потеряна · ${lead.id} · ${options.reason} · ${options.attempts}` }
}

export function renderClientTakenNotice(managerName: string): string {
  return `Вашу заявку взял ${managerName}`
}

export function renderLeadSummary(lead: Omit<LeadCardData, 'id' | 'createdAt'>): string {
  return `Проверьте заявку: ${lead.category}`
}

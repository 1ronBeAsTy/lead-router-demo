/**
 * Чистая маршрутизация: база сюда не заходит, всё приходит аргументами.
 * Благодаря этому правила покрываются тестами без Postgres.
 *
 * КОНТРАКТ — сигнатуры менять нельзя, на них завязаны services и тесты.
 */

export interface RoutingCandidate {
  id: string
  /** Больше — раньше. */
  priority: number
  categories: string[]
  isActive: boolean
  /** Сколько заявок сейчас висит на менеджере: PENDING-назначения + TAKEN-лиды. */
  activeLeadCount: number
  /** Когда менеджеру в последний раз что-то отправляли. `null` — никогда. */
  lastAssignedAt: Date | null
}

export interface PickOptions {
  category: string
  /** Менеджеры, которым эту заявку уже отправляли — второй раз не шлём. */
  excludeManagerIds: readonly string[]
}

/**
 * Кандидаты: активные, у кого в `categories` есть категория заявки,
 * и кому её ещё не отправляли.
 *
 * Порядок: `priority` по убыванию → `activeLeadCount` по возрастанию →
 * `lastAssignedAt` по возрастанию (никогда не получавшие идут первыми) →
 * `id` как детерминированный тай-брейк.
 *
 * @returns выбранного менеджера или `null`, если кандидатов не осталось.
 */
export function pickManager(
  candidates: readonly RoutingCandidate[],
  options: PickOptions,
): RoutingCandidate | null {
  throw new Error('TODO: реализовать в шаге 3')
}

/** Отфильтрованный список кандидатов в порядке выбора — для админки и тестов. */
export function rankCandidates(
  candidates: readonly RoutingCandidate[],
  options: PickOptions,
): RoutingCandidate[] {
  throw new Error('TODO: реализовать в шаге 3')
}

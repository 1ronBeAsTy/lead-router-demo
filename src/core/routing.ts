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

function isEligible(candidate: RoutingCandidate, options: PickOptions, excluded: Set<string>): boolean {
  if (!candidate.isActive) return false
  if (!candidate.categories.includes(options.category)) return false
  return !excluded.has(candidate.id)
}

/** `null` в `lastAssignedAt` значит «никогда не получал» — такой идёт первым. */
function lastAssignedKey(candidate: RoutingCandidate): number {
  return candidate.lastAssignedAt === null ? -Infinity : candidate.lastAssignedAt.getTime()
}

function compare(a: RoutingCandidate, b: RoutingCandidate): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  if (a.activeLeadCount !== b.activeLeadCount) return a.activeLeadCount - b.activeLeadCount

  const aLast = lastAssignedKey(a)
  const bLast = lastAssignedKey(b)
  if (aLast !== bLast) return aLast - bLast

  // Полный порядок обязателен: иначе на одинаковых метриках выбор «плавает»
  // между запусками и воспроизвести баг маршрутизации невозможно.
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
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
  return rankCandidates(candidates, options)[0] ?? null
}

/** Отфильтрованный список кандидатов в порядке выбора — для админки и тестов. */
export function rankCandidates(
  candidates: readonly RoutingCandidate[],
  options: PickOptions,
): RoutingCandidate[] {
  const excluded = new Set(options.excludeManagerIds)
  // filter уже отдаёт новый массив — входной не мутируем.
  return candidates.filter((c) => isEligible(c, options, excluded)).sort(compare)
}

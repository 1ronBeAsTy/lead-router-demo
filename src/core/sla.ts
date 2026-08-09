/**
 * Арифметика дедлайнов. Ни одного `setTimeout` — только вычисление `dueAt`,
 * который лежит в базе и переживает рестарт процесса.
 *
 * КОНТРАКТ — сигнатуры менять нельзя.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

/** `sentAt + slaMinutes`. */
export function computeDueAt(sentAt: Date, slaMinutes: number): Date {
  return new Date(sentAt.getTime() + slaMinutes * MINUTE_MS)
}

/** Просрочено, если `now >= dueAt` — граница считается просрочкой. */
export function isOverdue(dueAt: Date, now: Date): boolean {
  return now.getTime() >= dueAt.getTime()
}

/** Сколько миллисекунд осталось до дедлайна; отрицательное — уже просрочено. */
export function msUntilDue(dueAt: Date, now: Date): number {
  return dueAt.getTime() - now.getTime()
}

/** «14 мин», «2 мин 30 с» — без знака, для обеих веток `formatTimeLeft`. */
function humanize(ms: number): string | null {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return null
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes} мин` : `${minutes} мин ${seconds} с`
}

/** «14 мин», «2 мин 30 с», «просрочено на 1 мин» — для карточки менеджеру. */
export function formatTimeLeft(dueAt: Date, now: Date): string {
  const left = msUntilDue(dueAt, now)
  if (left <= 0) {
    const overdue = humanize(-left)
    return overdue === null ? 'просрочено' : `просрочено на ${overdue}`
  }
  return humanize(left) ?? 'меньше минуты'
}

/**
 * Цепочка исчерпана, если только что провалилась попытка номер `attempt`
 * и следующая вышла бы за `maxAttempts`.
 */
export function isChainExhausted(attempt: number, maxAttempts: number): boolean {
  return attempt >= maxAttempts
}

/** Экспоненциальный backoff для outbox: 2^attempts секунд, но не больше часа. */
export function outboxBackoffMs(attempts: number): number {
  const safe = Math.max(0, Math.floor(attempts))
  // 2^31 секунд уже переполняет разумные пределы, поэтому потолок ставим до умножения.
  if (safe > 20) return HOUR_MS
  return Math.min(2 ** safe * 1000, HOUR_MS)
}

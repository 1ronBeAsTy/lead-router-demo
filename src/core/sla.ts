/**
 * Арифметика дедлайнов. Ни одного `setTimeout` — только вычисление `dueAt`,
 * который лежит в базе и переживает рестарт процесса.
 *
 * КОНТРАКТ — сигнатуры менять нельзя.
 */

/** `sentAt + slaMinutes`. */
export function computeDueAt(sentAt: Date, slaMinutes: number): Date {
  throw new Error('TODO: реализовать в шаге 4')
}

/** Просрочено, если `now >= dueAt` — граница считается просрочкой. */
export function isOverdue(dueAt: Date, now: Date): boolean {
  throw new Error('TODO: реализовать в шаге 4')
}

/** Сколько миллисекунд осталось до дедлайна; отрицательное — уже просрочено. */
export function msUntilDue(dueAt: Date, now: Date): number {
  throw new Error('TODO: реализовать в шаге 4')
}

/** «14 мин», «2 мин 30 с», «просрочено на 1 мин» — для карточки менеджеру. */
export function formatTimeLeft(dueAt: Date, now: Date): string {
  throw new Error('TODO: реализовать в шаге 4')
}

/**
 * Цепочка исчерпана, если только что провалилась попытка номер `attempt`
 * и следующая вышла бы за `maxAttempts`.
 */
export function isChainExhausted(attempt: number, maxAttempts: number): boolean {
  throw new Error('TODO: реализовать в шаге 4')
}

/** Экспоненциальный backoff для outbox: 2^attempts секунд, но не больше часа. */
export function outboxBackoffMs(attempts: number): number {
  throw new Error('TODO: реализовать в шаге 6')
}

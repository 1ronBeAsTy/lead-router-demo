import type { Context, SessionFlavor } from 'grammy'

/**
 * Черновик анкеты живёт в памяти процесса (session из grammy).
 *
 * Это осознанный выбор, а не дыра в правиле «состояние в базе»: в памяти
 * лежит только незаконченный диалог. Потерянный при рестарте черновик — это
 * «клиент отправит /start заново», а не потерянная заявка. Всё, что имеет
 * цену — Lead, Assignment, dueAt — создаётся в базе после кнопки «Отправить»
 * и переживает рестарт без единого таймера в процессе.
 */

export interface Draft {
  /** Индекс текущего вопроса в QUESTIONS. */
  step: number
  /** Ответы по id вопроса. Пропущенные вопросы просто отсутствуют. */
  answers: Record<string, string>
  /** Показан экран подтверждения, ждём «Отправить» / «Заполнить заново». */
  awaitingConfirm: boolean
  /** Защита от двойного клика по «Отправить», пока идёт запись в базу. */
  submitting: boolean
}

export interface SessionData {
  draft: Draft | null
}

export type MyContext = Context & SessionFlavor<SessionData>

export function initialSession(): SessionData {
  return { draft: null }
}

export function newDraft(): Draft {
  return { step: 0, answers: {}, awaitingConfirm: false, submitting: false }
}

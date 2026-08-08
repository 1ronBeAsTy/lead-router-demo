/**
 * Единый формат callback_data. Telegram даёт 64 байта — cuid занимает 25,
 * так что префикс + id помещаются с запасом.
 */

export const CB = {
  /** Менеджер: «Беру» — `take:<assignmentId>` */
  TAKE: 'take',
  /** Менеджер: «Не могу» — `skip:<assignmentId>` */
  SKIP: 'skip',
  /** Менеджер: «Закрыл» — `close:<leadId>` */
  CLOSE: 'close',
  /** Клиент: ответ на вопрос — `a:<questionId>:<optionIndex>` */
  ANSWER: 'a',
  /** Клиент: пропустить вопрос — `sq:<questionId>` */
  SKIP_QUESTION: 'sq',
  /** Клиент: подтвердить заявку */
  SUBMIT: 'submit',
  /** Клиент: заполнить заново */
  RESTART: 'restart',
} as const

export type CallbackAction = (typeof CB)[keyof typeof CB]

const SEP = ':'

export function encode(action: CallbackAction, ...parts: (string | number)[]): string {
  const data = [action, ...parts].join(SEP)
  if (data.length > 64) throw new Error(`callback_data длиннее 64 байт: ${data}`)
  return data
}

export interface DecodedCallback {
  action: string
  parts: string[]
}

export function decode(data: string): DecodedCallback {
  const [action = '', ...parts] = data.split(SEP)
  return { action, parts }
}

export function matches(data: string, action: CallbackAction): boolean {
  return decode(data).action === action
}

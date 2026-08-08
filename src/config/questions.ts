/**
 * Анкета конфигом. Под нового клиента переделывается правкой одного файла —
 * шаги, тексты и кнопки берутся отсюда, `src/bot/flow.ts` их только исполняет.
 */

export type QuestionType = 'choice' | 'contact' | 'text'

export interface Question {
  readonly id: string
  readonly text: string
  readonly type: QuestionType
  readonly options?: readonly string[]
  readonly skippable?: boolean
  /** Подсказка под вопросом, если нужно объяснить формат ответа. */
  readonly hint?: string
}

export const QUESTIONS = [
  {
    id: 'category',
    text: 'Что нужно сделать?',
    type: 'choice',
    options: ['Ремонт', 'Установка', 'Диагностика', 'Другое'],
  },
  {
    id: 'urgency',
    text: 'Насколько это срочно?',
    type: 'choice',
    options: ['Срочно, сегодня', 'На этой неделе', 'Не горит'],
  },
  {
    id: 'contact',
    text: 'Как с вами связаться?',
    type: 'contact',
    hint: 'Нажмите кнопку ниже или пришлите номер телефона сообщением.',
  },
  {
    id: 'comment',
    text: 'Что-то ещё, что нам стоит знать?',
    type: 'text',
    skippable: true,
  },
] as const satisfies readonly Question[]

export type QuestionId = (typeof QUESTIONS)[number]['id']

/** Категории, из которых собирается маршрутизация и фильтры в админке. */
export const CATEGORIES: readonly string[] =
  QUESTIONS.find((q) => q.id === 'category')?.options ?? []

export const URGENCIES: readonly string[] =
  QUESTIONS.find((q) => q.id === 'urgency')?.options ?? []

export function questionAt(index: number): Question | undefined {
  return QUESTIONS[index]
}

export const TOTAL_STEPS = QUESTIONS.length

export const BOT_TEXTS = {
  welcome:
    'Здравствуйте! Несколько коротких вопросов — и заявка уйдёт свободному менеджеру. Это займёт полминуты.',
  restarted: 'Начинаем заново.',
  skip: 'Пропустить',
  shareContact: 'Отправить контакт',
  submit: 'Отправить',
  refill: 'Заполнить заново',
  summaryTitle: 'Проверьте заявку',
  submitted:
    'Заявка принята. Менеджер свяжется с вами в ближайшее время — как только возьмёт её в работу, пришлём подтверждение сюда.',
  cancelled: 'Заявка отменена. Отправьте /start, чтобы начать заново.',
  useButtons: 'Пожалуйста, выберите один из вариантов кнопками ниже.',
  unknown: 'Не понял. Отправьте /start, чтобы оформить заявку.',
} as const

import { InlineKeyboard } from 'grammy'
import { BOT_TEXTS } from '../config/questions'
import { CB, encode } from '../lib/callback'

/**
 * Карточки — чистый рендер. Ни базы, ни сети: функции возвращают текст и
 * клавиатуру, отправляет их вызывающий. Так `src/services` может рисовать
 * карточку, не импортируя обработчики бота (иначе получился бы цикл).
 *
 * КОНТРАКТ — сигнатуры менять нельзя, их зовёт src/services/assignment.ts.
 *
 * Все тексты — HTML: отправлять с `parse_mode: 'HTML'`. Пользовательский
 * ввод (имя, комментарий, телефон) везде прогоняется через `escapeHtml`.
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

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

/** Telegram HTML понимает только &lt; &gt; &amp; &quot; — остальное экранировать нечем. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Время показываем по Москве независимо от таймзоны хоста. `date-fns` умеет
 * только локальную зону (пакет `@date-fns/tz` в проект не ставили), поэтому
 * для перевода в MSK берём Intl — он есть в Node из коробки.
 */
const MSK = 'Europe/Moscow'

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: MSK,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: MSK,
  day: '2-digit',
  month: '2-digit',
})

/** `14:52` по Москве. */
export function formatTime(date: Date): string {
  return timeFormatter.format(date)
}

/** `09.08` по Москве. */
export function formatDate(date: Date): string {
  return dateFormatter.format(date)
}

/** `09.08, 14:52`. */
function formatDateTime(date: Date): string {
  return `${formatDate(date)}, ${formatTime(date)}`
}

/** «осталось 18 мин», «осталось 1 ч 05 мин», «время уже вышло». */
function timeLeftPhrase(dueAt: Date, now: Date): string {
  const ms = dueAt.getTime() - now.getTime()
  if (ms <= 0) return 'время уже вышло'
  if (ms < 60_000) return 'осталось меньше минуты'

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `осталось ${minutes} мин`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `осталось ${hours} ч ${String(rest).padStart(2, '0')} мин`
}

/** Короткий человекочитаемый номер заявки: cuid целиком читать невозможно. */
function shortId(id: string): string {
  return id.slice(-6).toUpperCase()
}

/**
 * Строки контакта. Телефон — в `<code>`: тап копирует его в буфер во всех
 * клиентах, а ссылки `tel:` Telegram в сообщениях бота не пропускает.
 */
function contactLines(lead: LeadCardData | Omit<LeadCardData, 'id' | 'createdAt'>): string[] {
  const lines: string[] = []

  const name = escapeHtml(lead.contactName)
  const user = lead.contactUser?.replace(/^@/, '').trim()
  lines.push(
    user
      ? `👤 <b>${name}</b> · <a href="https://t.me/${encodeURIComponent(user)}">@${escapeHtml(user)}</a>`
      : `👤 <b>${name}</b>`,
  )

  if (lead.contactPhone) {
    lines.push(`Телефон: <code>${escapeHtml(lead.contactPhone)}</code>`)
  }
  if (lead.comment?.trim()) {
    lines.push(`Комментарий: ${escapeHtml(lead.comment.trim())}`)
  }

  return lines
}

/** Шапка: категория и срочность — то, по чему менеджер решает за секунду. */
function headerLine(lead: LeadCardData | Omit<LeadCardData, 'id' | 'createdAt'>): string {
  return `<b>${escapeHtml(lead.category)}</b> · ${escapeHtml(lead.urgency)}`
}

function footerLine(lead: LeadCardData): string {
  return `<i>Заявка #${shortId(lead.id)} от ${formatDateTime(lead.createdAt)}</i>`
}

/** Общая «шапка + контакты + подвал», от которой отличаются только статусные строки. */
function leadBlock(lead: LeadCardData): string {
  return [headerLine(lead), ...contactLines(lead)].join('\n')
}

// ---------------------------------------------------------------------------
// Карточки
// ---------------------------------------------------------------------------

/** Карточка с кнопками «Беру» / «Не могу». */
export function renderAssignmentCard(lead: LeadCardData, options: AssignmentCardOptions): Card {
  const now = options.now ?? new Date()

  const text = [
    leadBlock(lead),
    '',
    `Попытка ${options.attempt} из ${options.maxAttempts} · ответить до <b>${formatTime(options.dueAt)}</b>, ${timeLeftPhrase(options.dueAt, now)}`,
    footerLine(lead),
  ].join('\n')

  const keyboard = new InlineKeyboard()
    .text('Беру', encode(CB.TAKE, options.assignmentId))
    .text('Не могу', encode(CB.SKIP, options.assignmentId))

  return { text, keyboard }
}

/** «Взял: Иван, 14:32» + кнопка «Закрыл». Кнопки принятия убраны. */
export function renderTakenCard(
  lead: LeadCardData,
  options: { managerName: string; takenAt: Date },
): Card {
  const text = [
    leadBlock(lead),
    '',
    `✅ Взял: <b>${escapeHtml(options.managerName)}</b>, ${formatTime(options.takenAt)}`,
    footerLine(lead),
  ].join('\n')

  const keyboard = new InlineKeyboard().text('Закрыл', encode(CB.CLOSE, lead.id))

  return { text, keyboard }
}

/** «Время вышло, заявка ушла дальше». Без кнопок. */
export function renderExpiredCard(lead: LeadCardData, options: { attempt: number }): Card {
  const text = [
    leadBlock(lead),
    '',
    `⌛ Время вышло, заявка ушла дальше (попытка ${options.attempt}).`,
    footerLine(lead),
  ].join('\n')

  return { text }
}

/** «Вы отказались, заявка ушла коллеге». Без кнопок. */
export function renderDeclinedCard(lead: LeadCardData): Card {
  const text = [
    leadBlock(lead),
    '',
    'Вы отказались — заявка ушла коллеге.',
    footerLine(lead),
  ].join('\n')

  return { text }
}

export function renderClosedCard(
  lead: LeadCardData,
  options: { managerName: string; closedAt: Date },
): Card {
  const text = [
    leadBlock(lead),
    '',
    `🏁 Закрыл: <b>${escapeHtml(options.managerName)}</b>, ${formatTime(options.closedAt)}`,
    footerLine(lead),
  ].join('\n')

  return { text }
}

/** Сообщение в чат эскалации, когда цепочка исчерпана. */
export function renderLostNotice(
  lead: LeadCardData,
  options: { attempts: number; reason: 'no_candidates' | 'max_attempts' },
): Card {
  const why =
    options.reason === 'no_candidates'
      ? `Свободных менеджеров по категории «${escapeHtml(lead.category)}» не нашлось.`
      : `Никто не ответил вовремя, попыток сделано: ${options.attempts}.`

  const text = [
    '⚠️ <b>Заявку никто не взял</b>',
    leadBlock(lead),
    '',
    why,
    'Свяжитесь с клиентом вручную.',
    footerLine(lead),
  ].join('\n')

  return { text }
}

/** Что уходит клиенту, когда его заявку взяли. */
export function renderClientTakenNotice(managerName: string): string {
  return `Заявку взял в работу менеджер <b>${escapeHtml(managerName)}</b> — свяжется с вами в ближайшее время.`
}

/** Сводка перед отправкой — экран подтверждения в анкете. */
export function renderLeadSummary(lead: Omit<LeadCardData, 'id' | 'createdAt'>): string {
  const lines = [
    `<b>${escapeHtml(BOT_TEXTS.summaryTitle)}</b>`,
    '',
    headerLine(lead),
    ...contactLines(lead),
  ]

  if (!lead.comment?.trim()) lines.push('Комментарий: —')

  return lines.join('\n')
}

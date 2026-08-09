import { Composer, InlineKeyboard, Keyboard } from 'grammy'
import {
  BOT_TEXTS,
  TOTAL_STEPS,
  questionAt,
  type Question,
  type QuestionId,
} from '../config/questions'
import { CB, decode, encode } from '../lib/callback'
import { createLogger } from '../lib/logger'
import { assignNextAttempt, createLead } from '../services/assignment'
import { escapeHtml, renderLeadSummary, type LeadCardData } from './cards'
import { newDraft, type Draft, type MyContext } from './session'

/**
 * Анкета. Шаги, тексты и варианты ответов берутся из `src/config/questions`,
 * здесь только исполнение: тип вопроса определяет способ ответа.
 */

const log = createLogger('bot:flow')

export const flow = new Composer<MyContext>()

/**
 * У анкеты шаги настраиваемые, а у модели Lead колонки фиксированные —
 * связь между ними одна: id вопроса. Если id в конфиге переименуют,
 * `satisfies` уронит сборку здесь, а не молча запишет пустую категорию.
 */
const FIELD = {
  category: 'category',
  urgency: 'urgency',
  contact: 'contact',
  comment: 'comment',
} satisfies Record<string, QuestionId>

type SummaryData = Omit<LeadCardData, 'id' | 'createdAt'>

// ---------------------------------------------------------------------------
// Показ вопросов
// ---------------------------------------------------------------------------

/** `/start` в любой момент — начинаем заново. */
export async function startSurvey(ctx: MyContext): Promise<void> {
  const hadDraft = ctx.session.draft !== null
  ctx.session.draft = newDraft()

  await ctx.reply(hadDraft ? BOT_TEXTS.restarted : BOT_TEXTS.welcome, {
    reply_markup: { remove_keyboard: true },
  })
  await askStep(ctx)
}

function questionText(question: Question, index: number): string {
  const head = `<b>${index + 1}/${TOTAL_STEPS}.</b> ${escapeHtml(question.text)}`
  return question.hint ? `${head}\n<i>${escapeHtml(question.hint)}</i>` : head
}

function skipButton(question: Question): [string, string] {
  return [BOT_TEXTS.skip, encode(CB.SKIP_QUESTION, question.id)]
}

function choiceKeyboard(question: Question): InlineKeyboard {
  const options = question.options ?? []
  // Короткие варианты кладём по два в ряд, длинные — по одному: так не рвётся текст.
  const perRow = options.every((o) => o.length <= 14) ? 2 : 1

  const kb = new InlineKeyboard()
  options.forEach((option, index) => {
    if (index > 0 && index % perRow === 0) kb.row()
    kb.text(option, encode(CB.ANSWER, question.id, index))
  })
  if (question.skippable) kb.row().text(...skipButton(question))

  return kb
}

async function askStep(ctx: MyContext): Promise<void> {
  const draft = ctx.session.draft
  if (!draft) return

  const question = questionAt(draft.step)
  if (!question) {
    await showSummary(ctx, draft)
    return
  }

  const text = questionText(question, draft.step)

  if (question.type === 'choice') {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: choiceKeyboard(question) })
    return
  }

  if (question.type === 'contact') {
    const kb = new Keyboard().requestContact(BOT_TEXTS.shareContact).resized().oneTime()
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb })
    return
  }

  // text: свободный ввод, при skippable добавляем «Пропустить»
  const kb = question.skippable ? new InlineKeyboard().text(...skipButton(question)) : undefined
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb })
}

/** Гасим кнопки у отвеченного вопроса, чтобы старые сообщения не кликали повторно. */
async function markAnswered(ctx: MyContext, answer: string): Promise<void> {
  const original = ctx.callbackQuery?.message?.text
  if (!original) return

  try {
    await ctx.editMessageText(`${escapeHtml(original)}\n\n➔ <b>${escapeHtml(answer)}</b>`, {
      parse_mode: 'HTML',
    })
  } catch {
    // Сообщение могли удалить или оно слишком старое — не повод ронять диалог.
  }
}

/** Записать ответ (или пропуск) и перейти к следующему шагу. */
async function advance(ctx: MyContext, question: Question, value: string | null): Promise<void> {
  const draft = ctx.session.draft
  if (!draft) return

  if (value !== null) draft.answers[question.id] = value
  draft.step += 1

  await askStep(ctx)
}

// ---------------------------------------------------------------------------
// Экран подтверждения
// ---------------------------------------------------------------------------

function draftToSummary(ctx: MyContext, draft: Draft): SummaryData {
  const from = ctx.from
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim()

  return {
    contactName: name || 'Без имени',
    contactUser: from?.username ?? null,
    contactPhone: draft.answers[FIELD.contact] ?? null,
    category: draft.answers[FIELD.category] ?? '—',
    urgency: draft.answers[FIELD.urgency] ?? '—',
    comment: draft.answers[FIELD.comment] ?? null,
  }
}

async function showSummary(ctx: MyContext, draft: Draft): Promise<void> {
  draft.awaitingConfirm = true

  const kb = new InlineKeyboard()
    .text(BOT_TEXTS.submit, encode(CB.SUBMIT))
    .text(BOT_TEXTS.refill, encode(CB.RESTART))

  await ctx.reply(renderLeadSummary(draftToSummary(ctx, draft)), {
    parse_mode: 'HTML',
    reply_markup: kb,
  })
}

// ---------------------------------------------------------------------------
// Ответы кнопками
// ---------------------------------------------------------------------------

/** Текущий вопрос, если callback пришёл именно на него. */
function currentQuestionFor(ctx: MyContext, questionId: string | undefined): Question | null {
  const draft = ctx.session.draft
  if (!draft || draft.awaitingConfirm) return null

  const question = questionAt(draft.step)
  if (!question || question.id !== questionId) return null

  return question
}

flow.callbackQuery(new RegExp(`^${CB.ANSWER}:`), async (ctx) => {
  const { parts } = decode(ctx.callbackQuery.data)
  const question = currentQuestionFor(ctx, parts[0])

  if (!question) {
    await ctx.answerCallbackQuery('Этот вопрос уже позади. /start — начать заново')
    return
  }

  const option = question.options?.[Number(parts[1])]
  if (option === undefined) {
    await ctx.answerCallbackQuery('Не понял вариант, выберите ещё раз')
    return
  }

  await ctx.answerCallbackQuery()
  await markAnswered(ctx, option)
  await advance(ctx, question, option)
})

flow.callbackQuery(new RegExp(`^${CB.SKIP_QUESTION}:`), async (ctx) => {
  const { parts } = decode(ctx.callbackQuery.data)
  const question = currentQuestionFor(ctx, parts[0])

  if (!question || !question.skippable) {
    await ctx.answerCallbackQuery('Этот вопрос уже позади. /start — начать заново')
    return
  }

  await ctx.answerCallbackQuery()
  await markAnswered(ctx, 'пропущено')
  await advance(ctx, question, null)
})

flow.callbackQuery(encode(CB.RESTART), async (ctx) => {
  await ctx.answerCallbackQuery()
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
  await startSurvey(ctx)
})

flow.callbackQuery(encode(CB.SUBMIT), async (ctx) => {
  const draft = ctx.session.draft

  if (!draft || !draft.awaitingConfirm || draft.submitting) {
    await ctx.answerCallbackQuery('Заявка уже отправлена. /start — оформить новую')
    return
  }
  if (!ctx.from) {
    await ctx.answerCallbackQuery('Не вижу, от кого заявка')
    return
  }

  draft.submitting = true
  await ctx.answerCallbackQuery()
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})

  const summary = draftToSummary(ctx, draft)

  let leadId: string
  try {
    const lead = await createLead({
      contactTgId: BigInt(ctx.from.id),
      contactName: summary.contactName,
      contactUser: summary.contactUser,
      contactPhone: summary.contactPhone,
      category: summary.category,
      urgency: summary.urgency,
      answers: { ...draft.answers },
      comment: summary.comment,
    })
    leadId = lead.id
  } catch (error) {
    draft.submitting = false
    log.error('Не удалось создать заявку', { error, tgUserId: ctx.from.id })
    await ctx.reply('Не получилось отправить заявку. Попробуйте ещё раз через минуту или /start.')
    return
  }

  ctx.session.draft = null
  await ctx.reply(BOT_TEXTS.submitted, { reply_markup: { remove_keyboard: true } })

  // Назначение уже создано в базе: если отправка карточки упадёт, апдейт
  // подхватит bot.catch, а заявку добьёт тикер — она не потеряется.
  await assignNextAttempt(leadId, { api: ctx.api })
})

// ---------------------------------------------------------------------------
// Ответы сообщениями
// ---------------------------------------------------------------------------

/**
 * Номер к единому виду. Десять цифр считаем российским номером без кода —
 * анкета русскоязычная, а менеджеру нужен номер, по которому можно позвонить.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  if (digits.length === 10) return `+7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`
  return `+${digits}`
}

flow.on('message:contact', async (ctx) => {
  const draft = ctx.session.draft
  const question = draft && !draft.awaitingConfirm ? questionAt(draft.step) : undefined

  if (!question || question.type !== 'contact') {
    await ctx.reply(BOT_TEXTS.unknown, { reply_markup: { remove_keyboard: true } })
    return
  }

  const phone = normalizePhone(ctx.message.contact.phone_number)
  if (!phone) {
    await ctx.reply('Не разобрал номер. Пришлите его сообщением, например +7 900 123-45-67.')
    return
  }

  await advance(ctx, question, phone)
})

flow.on('message:text', async (ctx) => {
  const draft = ctx.session.draft
  if (!draft) {
    await ctx.reply(BOT_TEXTS.unknown)
    return
  }

  if (draft.awaitingConfirm) {
    await ctx.reply('Заявка готова — нажмите «Отправить» или «Заполнить заново» под сводкой выше.')
    return
  }

  const question = questionAt(draft.step)
  if (!question) return

  const text = ctx.message.text.trim()

  switch (question.type) {
    case 'choice':
      await ctx.reply(BOT_TEXTS.useButtons)
      return

    case 'contact': {
      const phone = normalizePhone(text)
      if (!phone) {
        await ctx.reply(
          'Это не похоже на телефон. Пришлите номер вроде +7 900 123-45-67 или нажмите кнопку «' +
            BOT_TEXTS.shareContact +
            '».',
        )
        return
      }
      await advance(ctx, question, phone)
      return
    }

    case 'text': {
      if (!text) {
        await ctx.reply('Напишите пару слов — или нажмите «Пропустить».')
        return
      }
      await advance(ctx, question, text)
      return
    }
  }
})

/** Всё остальное (фото, стикеры, голосовые) — мягкое напоминание, а не молчание. */
flow.on('message', async (ctx) => {
  const draft = ctx.session.draft
  if (!draft) {
    await ctx.reply(BOT_TEXTS.unknown)
    return
  }

  const question = draft.awaitingConfirm ? undefined : questionAt(draft.step)
  await ctx.reply(
    question?.type === 'choice' ? BOT_TEXTS.useButtons : 'Пришлите ответ текстом, пожалуйста.',
  )
})

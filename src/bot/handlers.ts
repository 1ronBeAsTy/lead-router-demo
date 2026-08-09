import { Composer } from 'grammy'
import { CB, decode } from '../lib/callback'
import { createLogger } from '../lib/logger'
import { acceptAssignment, closeLead, declineAssignment } from '../services/assignment'
import type { MyContext } from './session'

/**
 * Кнопки менеджера. Вся логика переходов — в `src/services/assignment`:
 * здесь только разбор callback_data и ответ пользователю. Карточку после
 * успеха перерисовывает сервис, дублировать редактирование не нужно.
 */

const log = createLogger('bot:handlers')

export const handlers = new Composer<MyContext>()

/** Callback query без ответа крутит часики в клиенте — отвечаем всегда, даже на ошибке. */
async function reply(ctx: MyContext, text?: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery(text)
  } catch {
    // Апдейт мог протухнуть (Telegram даёт ~15 минут) — это не повод падать.
  }
}

/** id из `take:<id>` / `close:<id>`. */
function idFrom(ctx: MyContext): string | null {
  const data = ctx.callbackQuery?.data
  if (!data) return null
  return decode(data).parts[0] ?? null
}

handlers.callbackQuery(new RegExp(`^${CB.TAKE}:`), async (ctx) => {
  const assignmentId = idFrom(ctx)
  if (!assignmentId || !ctx.from) {
    await reply(ctx, 'Не понял, о какой заявке речь')
    return
  }

  try {
    const result = await acceptAssignment(assignmentId, BigInt(ctx.from.id), { api: ctx.api })

    if (result.ok) {
      await reply(ctx, 'Заявка ваша')
      return
    }

    await reply(
      ctx,
      result.reason === 'lost_race'
        ? 'Заявку уже взял коллега или истекло время'
        : result.reason === 'not_found'
          ? 'Заявка не найдена'
          : 'Это назначение не на вас',
    )
  } catch (error) {
    log.error('Не удалось принять заявку', { error, assignmentId })
    await reply(ctx, 'Что-то пошло не так, попробуйте ещё раз')
  }
})

handlers.callbackQuery(new RegExp(`^${CB.SKIP}:`), async (ctx) => {
  const assignmentId = idFrom(ctx)
  if (!assignmentId || !ctx.from) {
    await reply(ctx, 'Не понял, о какой заявке речь')
    return
  }

  try {
    const result = await declineAssignment(assignmentId, BigInt(ctx.from.id), { api: ctx.api })

    if (result.ok) {
      await reply(
        ctx,
        result.next.kind === 'lost' ? 'Больше некому передать — ушло в эскалацию' : 'Передал дальше',
      )
      return
    }

    await reply(
      ctx,
      result.reason === 'lost_race'
        ? 'Заявку уже взял коллега или истекло время'
        : result.reason === 'not_found'
          ? 'Заявка не найдена'
          : 'Это назначение не на вас',
    )
  } catch (error) {
    log.error('Не удалось отказаться от заявки', { error, assignmentId })
    await reply(ctx, 'Что-то пошло не так, попробуйте ещё раз')
  }
})

handlers.callbackQuery(new RegExp(`^${CB.CLOSE}:`), async (ctx) => {
  const leadId = idFrom(ctx)
  if (!leadId || !ctx.from) {
    await reply(ctx, 'Не понял, о какой заявке речь')
    return
  }

  try {
    const result = await closeLead(leadId, BigInt(ctx.from.id), { api: ctx.api })

    if (result.ok) {
      await reply(ctx, 'Заявка закрыта')
      return
    }

    await reply(
      ctx,
      result.reason === 'not_owner'
        ? 'Эту заявку закрывает тот, кто её взял'
        : result.reason === 'not_taken'
          ? 'Заявку ещё никто не взял'
          : 'Заявка не найдена',
    )
  } catch (error) {
    log.error('Не удалось закрыть заявку', { error, leadId })
    await reply(ctx, 'Что-то пошло не так, попробуйте ещё раз')
  }
})

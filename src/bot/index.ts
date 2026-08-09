import { pathToFileURL } from 'node:url'
import { Bot, GrammyError, HttpError, session } from 'grammy'
import { botEnv } from '../config/env'
import { createLogger } from '../lib/logger'
import { flow, startSurvey } from './flow'
import { handlers } from './handlers'
import { initialSession, type MyContext } from './session'

/**
 * Точка входа бота.
 *
 * КОНТРАКТ для src/worker.ts: `bot` и `startBot()`.
 *
 * Polling поднимается только при прямом запуске файла — импорт из воркера
 * не должен заводить второго получателя апдейтов (Telegram отдаёт их одному).
 */

export type { MyContext } from './session'

const log = createLogger('bot')

export const bot = new Bot<MyContext>(botEnv().BOT_TOKEN)

// Черновик анкеты — в памяти процесса, см. комментарий в session.ts.
bot.use(session({ initial: initialSession }))

bot.command('start', startSurvey)

// Кнопки менеджера идут первыми: у них узкие фильтры, анкету они не перехватят.
bot.use(handlers)
bot.use(flow)

bot.catch(async (err) => {
  const update = err.ctx.update.update_id
  const cause = err.error

  if (cause instanceof GrammyError) {
    log.error('Telegram отверг запрос', { update, description: cause.description })
  } else if (cause instanceof HttpError) {
    log.error('Не достучались до Telegram', { update, error: cause })
  } else {
    log.error('Ошибка обработки апдейта', { update, error: cause })
  }

  // Иначе у менеджера бесконечно крутятся часики на кнопке.
  if (err.ctx.callbackQuery) {
    await err.ctx
      .answerCallbackQuery('Что-то пошло не так, попробуйте ещё раз')
      .catch(() => undefined)
  }
})

let stopping = false

function registerShutdown(): void {
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return
    stopping = true
    log.info(`Получен ${signal}, останавливаю бота`)
    void bot.stop()
  }

  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

export async function startBot(): Promise<void> {
  await bot.api.setMyCommands([{ command: 'start', description: 'Оформить заявку' }])

  registerShutdown()

  // bot.start() резолвится только при остановке. Воркеру нужно управление
  // сразу после запуска polling, поэтому ждём onStart, а не саму промису.
  await new Promise<void>((resolve, reject) => {
    const onStart = (me: { username: string }) => {
      log.info(`Бот @${me.username} слушает апдейты`)
      resolve()
    }
    void bot.start({ onStart }).catch(reject)
  })
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entrypoint === import.meta.url) {
  startBot().catch((error) => {
    log.error('Бот не запустился', { error })
    process.exit(1)
  })
}

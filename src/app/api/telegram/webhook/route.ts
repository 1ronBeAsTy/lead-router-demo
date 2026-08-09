import { webhookCallback } from 'grammy'
import { env } from '@/config/env'
import { createLogger } from '@/lib/logger'

/**
 * Приём апдейтов вебхуком — режим для serverless, где долгоживущего процесса,
 * а значит и long polling, не существует.
 *
 * Локально бот по-прежнему работает polling'ом (`npm run dev:bot`). Держать
 * оба режима одновременно нельзя: Telegram отдаёт апдейты одному получателю,
 * и включённый вебхук молча выключает polling. Переключение — `npm run webhook`.
 */

const log = createLogger('webhook')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Бот собирается лениво и только на запросе. При импорте на верхнем уровне
 * `src/bot/index.ts` дёрнул бы `botEnv()` ещё на сборке — а падать на этапе
 * билда из-за отсутствующей переменной незачем.
 */
let handler: ((request: Request) => Promise<Response>) | null = null

async function getHandler(): Promise<(request: Request) => Promise<Response>> {
  if (handler) return handler

  const { bot } = await import('@/bot/index')
  // В вебхуке `bot.start()` не вызывается, поэтому botInfo нужно получить явно.
  if (!bot.isInited()) await bot.init()

  handler = webhookCallback(bot, 'std/http', {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  }) as (request: Request) => Promise<Response>

  return handler
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.BOT_TOKEN) {
    return Response.json({ error: 'BOT_TOKEN не задан' }, { status: 503 })
  }

  try {
    const handle = await getHandler()
    return await handle(request)
  } catch (error) {
    // Отдаём 200: на любой не-2xx Telegram будет ретраить один и тот же
    // апдейт по кругу. Ошибку видно в логах, очередь при этом не встаёт.
    log.error('Апдейт не обработан', { error })
    return Response.json({ ok: false }, { status: 200 })
  }
}

/** Проверка живости руками: открыть в браузере и убедиться, что роут есть. */
export function GET(): Response {
  return Response.json({ ok: true, mode: 'webhook' })
}

import { Api } from 'grammy'
import { env } from '@/config/env'
import { createLogger } from '@/lib/logger'
import { runEscalationTick } from '@/ticker/escalate'
import { runOutboxTick } from '@/ticker/outbox'

/**
 * Один проход тикера, вызываемый снаружи. Serverless-замена процессу из
 * `src/ticker/index.ts`: та же логика, но вместо своего цикла — планировщик.
 *
 * Дедлайны от этого не меняются: они и раньше жили в `Assignment.dueAt`,
 * а не в памяти. Роут можно звать как угодно часто и параллельно — переходы
 * статусов идут условными апдейтами, повторный вызов ничего не сломает.
 *
 * Кто дёргает:
 *  · Vercel Cron (план Pro, до раза в минуту) — шлёт `Authorization: Bearer $CRON_SECRET`
 *  · любой внешний планировщик — `?key=$CRON_SECRET`
 */

const log = createLogger('cron')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request): boolean {
  const expected = env.CRON_SECRET
  if (!expected) return false

  const header = request.headers.get('authorization')
  if (header === `Bearer ${expected}`) return true

  return new URL(request.url).searchParams.get('key') === expected
}

async function tick(): Promise<Response> {
  const started = Date.now()

  // Outbox от Telegram не зависит и должен работать даже без токена.
  const outbox = await runOutboxTick()

  let escalation: Awaited<ReturnType<typeof runEscalationTick>> | null = null
  if (process.env.BOT_TOKEN) {
    escalation = await runEscalationTick({ api: new Api(process.env.BOT_TOKEN) })
  } else {
    log.warn('BOT_TOKEN не задан — эскалация пропущена')
  }

  return Response.json({
    ok: true,
    ms: Date.now() - started,
    escalation,
    outbox,
  })
}

export async function GET(request: Request): Promise<Response> {
  if (!env.CRON_SECRET) {
    return Response.json({ error: 'CRON_SECRET не задан — роут выключен' }, { status: 503 })
  }
  if (!authorized(request)) {
    return Response.json({ error: 'Не авторизовано' }, { status: 401 })
  }

  try {
    return await tick()
  } catch (error) {
    log.error('Тик упал', { error })
    return Response.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

/** Некоторые планировщики умеют только POST. */
export const POST = GET

/**
 * Процесс тикера: два независимых цикла — эскалация просроченных назначений
 * и доставка outbox-заданий.
 *
 * Почему циклы, а не таймеры на заявку: единственный источник правды о дедлайне —
 * колонка `Assignment.dueAt`. Процесс можно убить в любой момент, ничего не
 * потеряется — следующий запуск подберёт всё просроченное первым же тиком.
 * `setInterval` здесь заводит только сам опрос базы, а не бизнес-дедлайн.
 */

import { pathToFileURL } from 'node:url'
import { Api } from 'grammy'
import { botEnv, env } from '../config/env'
import { prisma } from '../db/client'
import { createLogger } from '../lib/logger'
import { runEscalationTick } from './escalate'
import { runOutboxTick } from './outbox'

const log = createLogger('ticker')

interface Loop {
  stop(): Promise<void>
}

/**
 * Один цикл опроса. `current` защищает от наложения: если тик ещё идёт,
 * очередной звонок таймера просто пропускается. Ошибка тика логируется —
 * упавший тик не имеет права остановить цикл.
 */
function startLoop(name: string, intervalMs: number, tick: () => Promise<unknown>): Loop {
  let current: Promise<void> | null = null
  let stopped = false

  const run = (): void => {
    if (stopped || current) return
    current = tick()
      .then(() => undefined)
      .catch((error: unknown) => {
        log.error(`Тик «${name}» упал`, { error })
      })
      .finally(() => {
        current = null
      })
  }

  const timer = setInterval(run, intervalMs)
  timer.unref?.()
  run()

  return {
    async stop() {
      stopped = true
      clearInterval(timer)
      if (current) await current
    },
  }
}

export interface TickerHandle {
  stop(): Promise<void>
}

export async function startTickers(): Promise<TickerHandle> {
  const api = new Api(botEnv().BOT_TOKEN)
  const deps = { api }

  log.info('Тикеры запущены', {
    escalationMs: env.TICKER_INTERVAL_MS,
    outboxMs: env.OUTBOX_INTERVAL_MS,
  })

  const loops = [
    startLoop('escalation', env.TICKER_INTERVAL_MS, () => runEscalationTick(deps)),
    startLoop('outbox', env.OUTBOX_INTERVAL_MS, () => runOutboxTick()),
  ]

  return {
    async stop() {
      await Promise.all(loops.map((l) => l.stop()))
      log.info('Тикеры остановлены')
    },
  }
}

/** Корректное завершение: дождаться текущих тиков и закрыть пул соединений. */
export function installShutdown(handles: { stop(): Promise<void> }[]): void {
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info(`Получен ${signal}, завершаюсь`)
    void (async () => {
      try {
        for (const handle of handles) await handle.stop()
        await prisma.$disconnect()
      } catch (error) {
        log.error('Ошибка при завершении', { error })
      } finally {
        process.exit(0)
      }
    })()
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

/** Запуск как отдельного процесса: `npm run start:ticker`. */
async function main(): Promise<void> {
  const tickers = await startTickers()
  installShutdown([tickers])
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entrypoint === import.meta.url) {
  main().catch((error: unknown) => {
    log.error('Тикер не запустился', { error })
    process.exit(1)
  })
}

import { startBot } from './bot/index'
import { createLogger } from './lib/logger'
import { installShutdown, startTickers } from './ticker/index'

/**
 * Единый процесс для Railway: бот (long polling) и тикеры в одном контейнере.
 * Разделять их на два сервиса можно, но для демо это лишние деньги и лишний
 * деплой — база всё равно одна, а тикер идемпотентен.
 *
 * `.env` загружается внутри `config/env`, поэтому здесь обычные импорты.
 */

const log = createLogger('worker')

async function main(): Promise<void> {
  const tickers = await startTickers()
  installShutdown([tickers])

  log.info('Воркер запущен: бот + тикеры')
  await startBot()
}

main().catch((error: unknown) => {
  log.error('Воркер не запустился', { error })
  process.exit(1)
})

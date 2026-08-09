import { botEnv, env } from '../src/config/env'

/**
 * Переключение бота между polling и вебхуком.
 *
 *   npm run webhook info
 *   npm run webhook set https://demo.vercel.app
 *   npm run webhook delete
 *
 * Режимы взаимоисключающие: пока вебхук установлен, `getUpdates` возвращает
 * ошибку, и локальный `npm run dev:bot` работать не будет. Перед локальной
 * разработкой — `npm run webhook delete`.
 */

const API = `https://api.telegram.org/bot${botEnv().BOT_TOKEN}`
const PATH = '/api/telegram/webhook'

async function call(method: string, body?: Record<string, unknown>) {
  const response = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const json = (await response.json()) as { ok: boolean; result?: unknown; description?: string }
  if (!json.ok) throw new Error(`${method}: ${json.description ?? 'неизвестная ошибка'}`)
  return json.result
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2)

  switch (command) {
    case 'set': {
      if (!argument) throw new Error('Укажите базовый URL, например https://demo.vercel.app')
      const url = `${argument.replace(/\/+$/, '')}${PATH}`
      await call('setWebhook', {
        url,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query'],
      })
      console.log(`Вебхук установлен: ${url}`)
      if (!env.TELEGRAM_WEBHOOK_SECRET) {
        console.warn('TELEGRAM_WEBHOOK_SECRET не задан — эндпоинт открыт всем, кто знает адрес.')
      }
      return
    }

    case 'delete': {
      await call('deleteWebhook', { drop_pending_updates: false })
      console.log('Вебхук снят — бот снова может работать polling’ом.')
      return
    }

    case 'info':
    case undefined: {
      const info = (await call('getWebhookInfo')) as {
        url?: string
        pending_update_count?: number
        last_error_message?: string
        last_error_date?: number
      }
      console.log(`URL:                ${info.url || '(не задан, режим polling)'}`)
      console.log(`Ожидает апдейтов:   ${info.pending_update_count ?? 0}`)
      if (info.last_error_message) {
        const when = info.last_error_date
          ? new Date(info.last_error_date * 1000).toISOString()
          : '—'
        console.log(`Последняя ошибка:   ${info.last_error_message} (${when})`)
      }
      return
    }

    default:
      throw new Error(`Неизвестная команда «${command}». Доступны: info, set <url>, delete`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

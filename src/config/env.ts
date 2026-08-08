import { z } from 'zod'

/**
 * Валидация окружения на старте процесса, а не через час в проде.
 *
 * Разделено на два уровня: `env` нужен всем (веб, бот, тикер), `botEnv()`
 * вызывается только из процессов, которые реально ходят в Telegram.
 */

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
  ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD обязателен'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  ESCALATION_CHAT_ID: z.string().optional(),
  GOOGLE_SHEETS_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),

  TICKER_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
})

const botSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN обязателен для процессов bot и ticker'),
})

/** Пустая строка в .env — это «не задано», а не значение. */
function clean(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(source)) {
    out[key] = value === '' ? undefined : value
  }
  return out
}

function parseOrDie<T extends z.ZodType>(schema: T, label: string): z.infer<T> {
  const result = schema.safeParse(clean(process.env))
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`)
    console.error(`\nНекорректное окружение (${label}):\n${lines.join('\n')}\n`)
    process.exit(1)
  }
  return result.data
}

export const env = parseOrDie(baseSchema, 'base')

let botEnvCache: z.infer<typeof botSchema> | null = null

/** Ленивая проверка BOT_TOKEN — веб-процессу он не нужен. */
export function botEnv(): z.infer<typeof botSchema> {
  botEnvCache ??= parseOrDie(botSchema, 'bot')
  return botEnvCache
}

export const isProd = env.NODE_ENV === 'production'

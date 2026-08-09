import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Тестовое окружение. Читает `.env` руками (vitest и tsx его не грузят) и
 * подменяет `DATABASE_URL` на тестовую базу.
 *
 * Файл подключён как `setupFiles`, поэтому выполняется раньше, чем тест
 * импортирует `src/db/client.ts`, — синглтон Prisma сразу смотрит в
 * `lead_router_test`, и отдельный клиент не нужен.
 */

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))

function parseEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const fileEnv = parseEnvFile(path.join(PROJECT_ROOT, '.env'))
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value
}

const FALLBACK_TEST_URL =
  'postgresql://postgres:postgres@localhost:5433/lead_router_test?schema=public'

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || FALLBACK_TEST_URL

process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.NODE_ENV = 'test'
if (!process.env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = 'test'
if (!process.env.BOT_TOKEN) process.env.BOT_TOKEN = '000:test-token'

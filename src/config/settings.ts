import { prisma } from '../db/client'
import { env } from './env'

/**
 * Настройки живут в таблице `Setting`, чтобы админка меняла их без деплоя.
 * Значения из окружения — только дефолты первого запуска.
 */

export interface AppSettings {
  slaMinutes: number
  maxAttempts: number
  sheetId: string | null
  escalationChatId: string | null
}

export const SETTING_KEYS = ['slaMinutes', 'maxAttempts', 'sheetId', 'escalationChatId'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

export const DEFAULT_SETTINGS: AppSettings = {
  slaMinutes: 20,
  maxAttempts: 3,
  sheetId: env.GOOGLE_SHEETS_ID ?? null,
  escalationChatId: env.ESCALATION_CHAT_ID ?? null,
}

const CACHE_TTL_MS = 5_000
let cache: { value: AppSettings; at: number } | null = null

function toSettings(rows: { key: string; value: string }[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const num = (key: SettingKey, fallback: number) => {
    const raw = map.get(key)
    const parsed = raw === undefined ? NaN : Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
  }
  const str = (key: SettingKey, fallback: string | null) => {
    const raw = map.get(key)?.trim()
    return raw ? raw : fallback
  }

  return {
    slaMinutes: num('slaMinutes', DEFAULT_SETTINGS.slaMinutes),
    maxAttempts: num('maxAttempts', DEFAULT_SETTINGS.maxAttempts),
    sheetId: str('sheetId', DEFAULT_SETTINGS.sheetId),
    escalationChatId: str('escalationChatId', DEFAULT_SETTINGS.escalationChatId),
  }
}

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  const rows = await prisma.setting.findMany()
  const value = toSettings(rows)
  cache = { value, at: Date.now() }
  return value
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
  invalidateSettingsCache()
}

export async function setSettings(patch: Partial<Record<SettingKey, string>>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [SettingKey, string][]
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  )
  invalidateSettingsCache()
}

export function invalidateSettingsCache(): void {
  cache = null
}

/** Для тестов и сидов — собрать настройки из голых строк без похода в базу. */
export function settingsFromRows(rows: { key: string; value: string }[]): AppSettings {
  return toSettings(rows)
}

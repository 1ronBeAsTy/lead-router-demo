import type { Api } from 'grammy'
import { prisma } from '../../src/db/client'
import { invalidateSettingsCache, type SettingKey } from '../../src/config/settings'

/**
 * Хелперы интеграционных тестов: чистка базы, фейковый Telegram, фабрики строк.
 * Клиент — синглтон из `src/db/client.ts`: `tests/setup/env.ts` уже подменил
 * `DATABASE_URL` на тестовую базу до его импорта.
 */

const TABLES = ['Assignment', 'Lead', 'Manager', 'OutboxJob', 'Setting'] as const

let guarded = false

/** Страховка от TRUNCATE по рабочей базе, если кто-то поправит конфиг. */
async function assertTestDatabase(): Promise<void> {
  if (guarded) return
  const rows = await prisma.$queryRawUnsafe<{ current_database: string }[]>(
    'SELECT current_database()',
  )
  const name = rows[0]?.current_database ?? ''
  if (!name.includes('test')) {
    throw new Error(`Тесты подключены к базе «${name}» — ожидалась тестовая. Прогон остановлен.`)
  }
  guarded = true
}

export async function resetDb(): Promise<void> {
  await assertTestDatabase()
  const list = TABLES.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  invalidateSettingsCache()
}

export interface SentMessage {
  chatId: string
  text: string
}

export interface EditedMessage {
  chatId: string
  messageId: number
  text: string
}

export interface FakeApi {
  api: Api
  sent: SentMessage[]
  edited: EditedMessage[]
  /** Сообщения, ушедшие в конкретный чат (например, в чат эскалации). */
  sentTo(chatId: string | number): SentMessage[]
}

export function makeFakeApi(): FakeApi {
  const sent: SentMessage[] = []
  const edited: EditedMessage[] = []
  let nextMessageId = 1000

  const api = {
    async sendMessage(chatId: string | number, text: string) {
      sent.push({ chatId: String(chatId), text })
      const id = Number(chatId)
      return {
        message_id: ++nextMessageId,
        chat: { id: Number.isFinite(id) ? id : 0 },
        text,
      }
    },
    async editMessageText(chatId: string | number, messageId: number, text: string) {
      edited.push({ chatId: String(chatId), messageId, text })
      return true
    },
    async editMessageReplyMarkup() {
      return true
    },
  }

  return {
    api: api as unknown as Api,
    sent,
    edited,
    sentTo: (chatId) => sent.filter((m) => m.chatId === String(chatId)),
  }
}

export interface ManagerInput {
  name: string
  tgUserId: bigint | number
  categories?: string[]
  priority?: number
  isActive?: boolean
}

export async function createManager(input: ManagerInput) {
  return prisma.manager.create({
    data: {
      name: input.name,
      tgUserId: BigInt(input.tgUserId),
      categories: input.categories ?? ['Ремонт'],
      priority: input.priority ?? 0,
      isActive: input.isActive ?? true,
    },
  })
}

export async function setTestSettings(patch: Partial<Record<SettingKey, string>>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    })
  }
  invalidateSettingsCache()
}

export const LEAD_INPUT = {
  contactTgId: 777_000n,
  contactName: 'Клиент Тестовый',
  contactUser: 'client',
  contactPhone: '+79990000000',
  category: 'Ремонт',
  urgency: 'Срочно, сегодня',
  answers: { category: 'Ремонт', urgency: 'Срочно, сегодня' },
  comment: 'нужен мастер',
}

export { prisma }

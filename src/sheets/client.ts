// JWT берём из самого googleapis: отдельно установленный google-auth-library
// может оказаться другой версии, и его типы не подставляются в google.sheets().
import { google, type sheets_v4 } from 'googleapis'
import { prisma } from '../db/client'
import { env } from '../config/env'
import { getSettings } from '../config/settings'
import { createLogger } from '../lib/logger'

/**
 * Выгрузка заявок в Google Sheets. Вызывается только из outbox-воркера,
 * поэтому имеет право быть медленной и падать — ретраи снаружи.
 *
 * Если креды или sheetId не заданы (обычный случай для локального демо),
 * функции молча выходят с успехом: задания не должны копиться в FAILED.
 */

const log = createLogger('sheets')

const HEADER = [
  'Дата',
  'ID',
  'Имя',
  'Контакт',
  'Категория',
  'Срочность',
  'Комментарий',
  'Статус',
  'Менеджер',
  'Время до ответа',
  'Попыток',
] as const

const FIRST_COLUMN = 'A'
const LAST_COLUMN = 'K'

const STATUS_RU: Record<string, string> = {
  NEW: 'Новая',
  ASSIGNED: 'Отправлена менеджеру',
  TAKEN: 'В работе',
  CLOSED: 'Закрыта',
  LOST: 'Потеряна',
}

let cachedClient: sheets_v4.Sheets | null = null

export interface SheetsCredentials {
  email: string
  privateKey: string
}

function readCredentials(): SheetsCredentials | null {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const rawKey = env.GOOGLE_PRIVATE_KEY?.trim()
  if (!email || !rawKey) return null
  // В .env и в переменных Railway ключ хранится одной строкой с «\n».
  return { email, privateKey: rawKey.replace(/\\n/g, '\n') }
}

function getClient(credentials: SheetsCredentials): sheets_v4.Sheets {
  if (cachedClient) return cachedClient
  const auth = new google.auth.JWT({
    email: credentials.email,
    key: credentials.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  cachedClient = google.sheets({ version: 'v4', auth })
  return cachedClient
}

/** Настроены ли креды и таблица — админка показывает это статусом интеграции. */
export async function isSheetsConfigured(): Promise<boolean> {
  const { sheetId } = await getSettings()
  return Boolean(sheetId) && readCredentials() !== null
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Moscow',
  }).format(value)
}

function formatResponseTime(createdAt: Date, takenAt: Date | null): string {
  if (!takenAt) return ''
  const minutes = Math.max(0, Math.round((takenAt.getTime() - createdAt.getTime()) / 60_000))
  return `${minutes} мин`
}

function contactOf(lead: {
  contactPhone: string | null
  contactUser: string | null
  contactTgId: bigint
}): string {
  if (lead.contactPhone) return lead.contactPhone
  if (lead.contactUser) return `@${lead.contactUser.replace(/^@/, '')}`
  return `tg:${lead.contactTgId.toString()}`
}

/**
 * Обновить (или дописать) строку заявки. Поиск идёт по ID в колонке B —
 * это единственный столбец, который мы гарантированно не меняем руками.
 */
export async function upsertLeadRow(leadId: string): Promise<void> {
  const { sheetId } = await getSettings()
  const credentials = readCredentials()

  if (!sheetId || !credentials) {
    log.info('Sheets не настроен, пропускаю', { leadId })
    return
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { takenBy: true, _count: { select: { assignments: true } } },
  })
  if (!lead) {
    log.warn('Заявка не найдена, нечего выгружать', { leadId })
    return
  }

  const row = [
    formatDate(lead.createdAt),
    lead.id,
    lead.contactName,
    contactOf(lead),
    lead.category,
    lead.urgency,
    lead.comment ?? '',
    STATUS_RU[lead.status] ?? lead.status,
    lead.takenBy?.name ?? '',
    formatResponseTime(lead.createdAt, lead.takenAt),
    String(lead._count.assignments),
  ]

  const sheets = getClient(credentials)
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${FIRST_COLUMN}:${LAST_COLUMN}`,
  })
  const values = existing.data.values ?? []

  if (values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${FIRST_COLUMN}1:${LAST_COLUMN}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[...HEADER]] },
    })
    values.push([...HEADER])
  }

  const index = values.findIndex((r) => r?.[1] === lead.id)

  if (index >= 0) {
    const rowNumber = index + 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${FIRST_COLUMN}${rowNumber}:${LAST_COLUMN}${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })
    log.debug('Строка заявки обновлена', { leadId, rowNumber })
    return
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${FIRST_COLUMN}:${LAST_COLUMN}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
  log.debug('Строка заявки дописана', { leadId })
}

/** Только для тестов и смены настроек на лету. */
export function resetSheetsClientCache(): void {
  cachedClient = null
}

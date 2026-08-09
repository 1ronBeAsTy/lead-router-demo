/**
 * Демо-данные: 5 менеджеров и ~200 заявок за две недели с настоящими
 * цепочками назначений. Статистика админки считается по `Assignment`,
 * поэтому цепочки строятся как в проде — с `attempt`, `dueAt` и разрешениями,
 * а не проставляются задним числом в `Lead`.
 *
 * Сид идемпотентный и детерминированный: чистит таблицы и наполняет их заново
 * из seeded-random, так что демо воспроизводится байт в байт.
 *
 * Запуск: npm run db:seed
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { CATEGORIES, URGENCIES } from '../src/config/questions'

// ─────────────────────────────────────────────────────────────────────────────
// Окружение. tsx не читает .env сам, а Prisma Client берёт URL при создании.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

function loadEnvFile(path: string): void {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    let value = (match[2] ?? '').trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(resolve(ROOT, '.env'))

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL не задан — проверьте .env в корне проекта.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl })

// ─────────────────────────────────────────────────────────────────────────────
// Детерминированный random. Демо должно выглядеть одинаково на каждом прогоне,
// иначе скриншот и запись экрана разойдутся с тем, что увидит зритель.
// ─────────────────────────────────────────────────────────────────────────────

function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = makeRandom(20260808)

const int = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1))
const chance = (p: number) => rnd() < p
const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]

/** Индекс по весам — распределения категорий, срочности и часов суток. */
function weightedIndex(weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = rnd() * total
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return i
  }
  return weights.length - 1
}

/** Значение в диапазоне со смещением к нижней границе: `power` > 1 — сильнее жмёт вниз. */
function skewed(min: number, max: number, power: number): number {
  return Math.round(min + Math.pow(rnd(), power) * (max - min))
}

let idCounter = 0

/** cuid-подобный id: детерминированный, но визуально неотличимый от настоящего. */
function makeId(at: Date): string {
  const ts = at.getTime().toString(36)
  const seq = (idCounter++).toString(36).padStart(4, '0')
  const tail = Math.floor(rnd() * 36 ** 10)
    .toString(36)
    .padStart(10, '0')
  return `c${ts}${seq}${tail}`.slice(0, 25)
}

// ─────────────────────────────────────────────────────────────────────────────
// Константы демо
// ─────────────────────────────────────────────────────────────────────────────

const SLA_MINUTES = 20
const MAX_ATTEMPTS = 3
const SLA_MS = SLA_MINUTES * 60_000

const DAYS = 14
const HISTORICAL_LEADS = 194

const NOW = new Date()

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms)

// ─────────────────────────────────────────────────────────────────────────────
// Справочники
// ─────────────────────────────────────────────────────────────────────────────

interface SeedManager {
  id: string
  tgUserId: bigint
  name: string
  categories: string[]
  isActive: boolean
  priority: number
  createdAt: Date
}

const MANAGERS: SeedManager[] = [
  {
    id: 'cmgr0000000000000000001',
    tgUserId: 512_884_017n,
    name: 'Ирина Соколова',
    categories: ['Ремонт', 'Диагностика'],
    isActive: true,
    priority: 10,
    createdAt: addMs(NOW, -120 * DAY),
  },
  {
    id: 'cmgr0000000000000000002',
    tgUserId: 486_120_933n,
    name: 'Павел Кузнецов',
    categories: ['Установка', 'Ремонт'],
    isActive: true,
    priority: 8,
    createdAt: addMs(NOW, -113 * DAY),
  },
  {
    id: 'cmgr0000000000000000003',
    tgUserId: 731_450_268n,
    name: 'Марина Величко',
    categories: ['Диагностика', 'Другое'],
    isActive: true,
    priority: 5,
    createdAt: addMs(NOW, -88 * DAY),
  },
  {
    id: 'cmgr0000000000000000004',
    tgUserId: 604_337_712n,
    name: 'Артём Гвоздев',
    categories: ['Ремонт', 'Установка', 'Диагностика', 'Другое'],
    isActive: true,
    priority: 3,
    createdAt: addMs(NOW, -61 * DAY),
  },
  {
    id: 'cmgr0000000000000000005',
    tgUserId: 559_902_484n,
    name: 'Олег Тарасов',
    categories: ['Установка', 'Другое'],
    isActive: false, // ушёл из смены — в новую маршрутизацию не попадает, история осталась
    priority: 0,
    createdAt: addMs(NOW, -140 * DAY),
  },
]

/** До этого момента Олег ещё работал — иначе у неактивного менеджера пустая история. */
const INACTIVE_UNTIL = addMs(NOW, -9 * DAY)

const FIRST_NAMES_M = [
  'Алексей', 'Дмитрий', 'Сергей', 'Николай', 'Егор', 'Виталий', 'Роман', 'Кирилл',
  'Тимур', 'Максим', 'Андрей', 'Владислав', 'Георгий', 'Пётр', 'Руслан', 'Игорь',
]
const FIRST_NAMES_F = [
  'Анна', 'Ольга', 'Екатерина', 'Наталья', 'Юлия', 'Светлана', 'Дарья', 'Ксения',
  'Валентина', 'Полина', 'Алина', 'Вера', 'Маргарита', 'Тамара', 'Лидия',
]
const LAST_NAMES_M = [
  'Ковалёв', 'Морозов', 'Синицын', 'Абрамов', 'Ерофеев', 'Панкратов', 'Жуков',
  'Лебедев', 'Дьяченко', 'Смирнов', 'Хабибуллин', 'Черных', 'Гусев', 'Ремизов',
  'Токарев', 'Барсуков', 'Никонов', 'Шевцов', 'Плотников', 'Аверин',
]
const LAST_NAMES_F = [
  'Ковалёва', 'Морозова', 'Синицына', 'Абрамова', 'Ерофеева', 'Панкратова', 'Жукова',
  'Лебедева', 'Дьяченко', 'Смирнова', 'Хабибуллина', 'Черных', 'Гусева', 'Ремизова',
  'Токарева', 'Барсукова', 'Никонова', 'Шевцова', 'Плотникова', 'Аверина',
]

const TRANSLIT = [
  'alex', 'dmitry', 'sergey', 'nikolay', 'egor', 'vitaly', 'roman', 'kirill',
  'anna', 'olga', 'kate', 'natalie', 'julia', 'sveta', 'dasha', 'ksenia',
  'timur', 'maxim', 'andrey', 'vlad', 'polina', 'alina', 'vera', 'rita',
]

const COMMENTS_BY_CATEGORY: Record<string, string[]> = {
  Ремонт: [
    'Течёт из-под крышки, подставили таз. Второй день так.',
    'Гудит на отжиме, будто что-то попало внутрь.',
    'Не включается совсем, индикатор не горит.',
    'После скачка напряжения перестал держать температуру.',
    'Стучит при работе, соседи уже жалуются.',
    'Работает, но выключается через десять минут сам.',
    'Прошлый мастер менял плату полгода назад, опять то же самое.',
    'Запах гари при включении, сразу выдернули из розетки.',
  ],
  Установка: [
    'Новая квартира, коммуникации выведены, нужен монтаж под ключ.',
    'Купили на распродаже, коробку ещё не вскрывали.',
    'Нужен вынос за окно, третий этаж, балкон открытый.',
    'Старое надо забрать на утилизацию, если это возможно.',
    'Есть свой крепёж, нужны только руки и инструмент.',
    'Стена бетонная, у прошлой бригады бур не взял.',
    'Хотим до конца недели, приезжают родственники.',
  ],
  Диагностика: [
    'Непонятно, что сломалось. Нужно, чтобы посмотрели и сказали цену.',
    'Иногда работает, иногда нет. Закономерности не нашли.',
    'Хочу понять, есть ли смысл чинить или проще менять.',
    'Гарантия кончилась месяц назад, хочу независимую оценку.',
    'Показывает ошибку E4, в интернете пишут разное.',
    'Нужно заключение письменно, для страховой.',
  ],
  Другое: [
    'Нужна консультация по обслуживанию, ничего не сломано.',
    'Хочу договор на регулярное обслуживание для офиса.',
    'Уточните, работаете ли вы по безналу с НДС.',
    'Вопрос по прошлому заказу, номер не сохранился.',
    'Можно ли перенести визит мастера на другой день?',
    'Интересует стоимость выезда за город, 30 км от МКАД.',
  ],
}

const EXTRA_NOTES = [
  'Удобнее звонить после 18:00.',
  'Домофон не работает, наберите с улицы.',
  'Есть кошка, дверь придётся придержать.',
  'Подъезд со двора, код 1234.',
  'На связи только в мессенджере.',
  'Пропуск на территорию заказывать заранее.',
]

const CATEGORY_WEIGHTS = [0.40, 0.24, 0.22, 0.14] // Ремонт / Установка / Диагностика / Другое
const URGENCY_WEIGHTS = [0.30, 0.45, 0.25]

/** Будни гуще выходных. Индексы — как у `Date#getDay`: 0 — воскресенье. */
const WEEKDAY_WEIGHTS = [0.35, 1.15, 1.25, 1.2, 1.15, 1.0, 0.5]

/** Часы суток: утренний разгон, обеденный провал, вечерний хвост. */
const HOUR_WEIGHTS = [
  0.15, 0.08, 0.05, 0.04, 0.05, 0.12, 0.35, 0.9, // 00–07
  2.2, 4.4, 6.2, 6.6, 4.8, 3.4, 5.0, 6.1,        // 08–15
  6.0, 5.4, 4.0, 2.9, 1.9, 1.1, 0.6, 0.3,        // 16–23
]

// ─────────────────────────────────────────────────────────────────────────────
// Генерация заявок
// ─────────────────────────────────────────────────────────────────────────────

type AssignmentStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
type LeadStatus = 'NEW' | 'ASSIGNED' | 'TAKEN' | 'CLOSED' | 'LOST'

interface LeadRow {
  id: string
  createdAt: Date
  contactTgId: bigint
  contactName: string
  contactUser: string | null
  contactPhone: string | null
  category: string
  urgency: string
  answers: unknown
  comment: string | null
  status: LeadStatus
  takenById: string | null
  takenAt: Date | null
  closedAt: Date | null
  lostAt: Date | null
}

interface AssignmentRow {
  id: string
  leadId: string
  managerId: string
  attempt: number
  sentAt: Date
  dueAt: Date
  status: AssignmentStatus
  resolvedAt: Date | null
  chatId: bigint | null
  messageId: number | null
}

const leads: LeadRow[] = []
const assignments: AssignmentRow[] = []

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Момент создания заявки: день по весам недели, время суток по весам часов. */
function sampleCreatedAt(): Date {
  const latest = NOW.getTime() - 40 * MINUTE // свежие заявки создаются отдельно
  for (let tries = 0; tries < 24; tries += 1) {
    const dayOffset = DAYS - 1 - Math.floor(rnd() * DAYS)
    const day = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - dayOffset)
    if (rnd() > WEEKDAY_WEIGHTS[day.getDay()] / 1.25) continue

    const candidate = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      weightedIndex(HOUR_WEIGHTS),
      int(0, 59),
      int(0, 59),
    )
    if (candidate.getTime() <= latest) return candidate
  }
  // Крайний случай — равномерно по прошедшим суткам.
  return new Date(startOfDay(NOW).getTime() - int(1, DAYS - 1) * DAY + int(9, 19) * HOUR)
}

function makeContact() {
  const female = chance(0.45)
  const first = female ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M)
  const last = female ? pick(LAST_NAMES_F) : pick(LAST_NAMES_M)
  const name = chance(0.75) ? `${first} ${last}` : first

  const hasUser = chance(0.55)
  const contactUser = hasUser ? `${pick(TRANSLIT)}_${int(10, 99)}` : null
  const contactPhone = chance(0.78)
    ? `+79${int(10, 89)}${int(1000000, 9999999)}`
    : null

  return {
    contactTgId: BigInt(int(120_000_000, 899_999_999)),
    contactName: name,
    contactUser,
    // Хотя бы один канал связи должен быть — иначе заявка бессмысленна.
    contactPhone: contactUser ? contactPhone : contactPhone ?? `+79${int(10, 89)}${int(1000000, 9999999)}`,
  }
}

/** Кандидаты на момент создания заявки: категория совпадает, менеджер тогда работал. */
function candidatesFor(category: string, createdAt: Date): SeedManager[] {
  return MANAGERS.filter(
    (m) => m.categories.includes(category) && (m.isActive || createdAt < INACTIVE_UNTIL),
  )
    .map((m) => ({ m, score: m.priority + rnd() * 6 })) // приоритет плюс шум под балансировку нагрузки
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.m)
}

/**
 * Время до «Беру»: 30 секунд … 19 минут со смещением к малым значениям.
 * Верхняя граница ниже SLA — иначе принятие пришлось бы уже после протухания.
 */
function responseDelayMs(): number {
  return skewed(30_000, 19 * MINUTE, 2.3)
}

interface Outcome {
  taken: boolean
  attempt: number
}

/**
 * Исходы раздаются по плану, а не броском на каждую заявку: на двух сотнях
 * записей случайность даёт разброс в несколько процентов, а в демо доля
 * «взято с первой попытки» — это цифра на карточке, она должна быть ровно той,
 * что обещана. Перемешивание оставляет распределение по дням естественным.
 */
function buildOutcomePlan(count: number): Outcome[] {
  const takenFirst = Math.round(count * 0.7)
  const lost = Math.round(count * 0.1)
  const multi = count - takenFirst - lost

  const plan: Outcome[] = []
  for (let i = 0; i < takenFirst; i += 1) plan.push({ taken: true, attempt: 1 })
  for (let i = 0; i < multi; i += 1) plan.push({ taken: true, attempt: i % 3 === 2 ? 3 : 2 })
  for (let i = 0; i < lost; i += 1) plan.push({ taken: false, attempt: MAX_ATTEMPTS })

  for (let i = plan.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = plan[i]
    plan[i] = plan[j]
    plan[j] = tmp
  }
  return plan
}

function buildLead(createdAt: Date, outcome: Outcome): void {
  const category = CATEGORIES[weightedIndex(CATEGORY_WEIGHTS)]
  const urgency = URGENCIES[weightedIndex(URGENCY_WEIGHTS)]
  const contact = makeContact()
  const leadId = makeId(createdAt)

  const pool = COMMENTS_BY_CATEGORY[category] ?? []
  let comment: string | null = chance(0.72) ? pick(pool) : null
  if (comment && chance(0.22)) comment = `${comment} ${pick(EXTRA_NOTES)}`

  const candidates = candidatesFor(category, createdAt)

  // Если свободных менеджеров в категории меньше, чем попыток по плану,
  // цепочка обрывается раньше — так же, как оборвётся в проде.
  const willBeTaken = outcome.taken
  const chainLength = Math.min(outcome.attempt, candidates.length, MAX_ATTEMPTS)

  let status: LeadStatus = 'LOST'
  let takenById: string | null = null
  let takenAt: Date | null = null
  let closedAt: Date | null = null
  let lostAt: Date | null = null

  // Диспетчеризация: заявка уходит менеджеру через пару секунд после создания.
  let cursor = addMs(createdAt, int(1_500, 9_000))
  let lastResolvedAt = cursor

  for (let attempt = 1; attempt <= chainLength; attempt += 1) {
    const manager = candidates[attempt - 1]
    const sentAt = cursor
    const dueAt = addMs(sentAt, SLA_MS)
    const isFinal = attempt === chainLength

    if (isFinal && willBeTaken) {
      const resolvedAt = addMs(sentAt, responseDelayMs())
      assignments.push({
        id: makeId(sentAt),
        leadId,
        managerId: manager.id,
        attempt,
        sentAt,
        dueAt,
        status: 'ACCEPTED',
        resolvedAt,
        chatId: manager.tgUserId,
        messageId: int(1000, 99_999),
      })
      takenById = manager.id
      takenAt = resolvedAt
      lastResolvedAt = resolvedAt
      status = 'TAKEN'
    } else {
      // Отказ приходит быстро, протухание — ровно в дедлайн.
      const declined = chance(0.34)
      const resolvedAt = declined ? addMs(sentAt, skewed(20_000, 8 * MINUTE, 1.7)) : dueAt
      assignments.push({
        id: makeId(sentAt),
        leadId,
        managerId: manager.id,
        attempt,
        sentAt,
        dueAt,
        status: declined ? 'DECLINED' : 'EXPIRED',
        resolvedAt,
        chatId: manager.tgUserId,
        messageId: int(1000, 99_999),
      })
      lastResolvedAt = resolvedAt
      // Отказ переадресуется мгновенно, протухание — на ближайшем тике.
      cursor = addMs(resolvedAt, declined ? int(800, 3_000) : int(1_000, 11_000))
    }
  }

  if (status === 'TAKEN' && takenAt) {
    // Закрытие: чаще в тот же день, но хвост уходит на сутки с лишним.
    const closeDelay = skewed(12 * MINUTE, 26 * HOUR, 1.9)
    const candidateClosedAt = addMs(takenAt, closeDelay)
    if (candidateClosedAt.getTime() < NOW.getTime() - MINUTE) {
      status = 'CLOSED'
      closedAt = candidateClosedAt
    }
  } else {
    lostAt = addMs(lastResolvedAt, int(1_000, 9_000))
  }

  leads.push({
    id: leadId,
    createdAt,
    ...contact,
    category,
    urgency,
    answers: {
      category,
      urgency,
      contact: contact.contactPhone ?? (contact.contactUser ? `@${contact.contactUser}` : null),
      comment,
    },
    comment,
    status,
    takenById,
    takenAt,
    closedAt,
    lostAt,
  })
}

/** Живые заявки: без них дашборд выглядит как архив, а не как рабочий инструмент. */
function buildLiveLeads(): void {
  // Только что созданы, тикер ещё не разослал.
  for (let i = 0; i < 2; i += 1) {
    const createdAt = addMs(NOW, -int(2, 24) * MINUTE)
    const category = CATEGORIES[weightedIndex(CATEGORY_WEIGHTS)]
    const contact = makeContact()
    const comment = chance(0.6) ? pick(COMMENTS_BY_CATEGORY[category] ?? []) : null
    const urgency = URGENCIES[weightedIndex(URGENCY_WEIGHTS)]
    leads.push({
      id: makeId(createdAt),
      createdAt,
      ...contact,
      category,
      urgency,
      answers: { category, urgency, contact: contact.contactPhone, comment },
      comment,
      status: 'NEW',
      takenById: null,
      takenAt: null,
      closedAt: null,
      lostAt: null,
    })
  }

  // Ушли менеджеру, дедлайн ещё не наступил.
  for (let i = 0; i < 4; i += 1) {
    const secondAttempt = i === 3 // одна заявка уже на второй попытке
    const createdAt = addMs(NOW, -(secondAttempt ? int(23, 31) : int(1, 16)) * MINUTE)
    const category = CATEGORIES[weightedIndex(CATEGORY_WEIGHTS)]
    const urgency = URGENCIES[weightedIndex(URGENCY_WEIGHTS)]
    const contact = makeContact()
    const comment = chance(0.7) ? pick(COMMENTS_BY_CATEGORY[category] ?? []) : null
    const leadId = makeId(createdAt)
    const candidates = candidatesFor(category, createdAt)

    let cursor = addMs(createdAt, int(1_500, 6_000))
    let attempt = 1

    if (secondAttempt && candidates.length > 1) {
      const first = candidates[0]
      const dueAt = addMs(cursor, SLA_MS)
      assignments.push({
        id: makeId(cursor),
        leadId,
        managerId: first.id,
        attempt: 1,
        sentAt: cursor,
        dueAt,
        status: 'EXPIRED',
        resolvedAt: dueAt,
        chatId: first.tgUserId,
        messageId: int(1000, 99_999),
      })
      cursor = addMs(dueAt, int(1_000, 8_000))
      attempt = 2
    }

    const manager = candidates[attempt - 1] ?? candidates[0] ?? MANAGERS[0]
    assignments.push({
      id: makeId(cursor),
      leadId,
      managerId: manager.id,
      attempt,
      sentAt: cursor,
      dueAt: addMs(cursor, SLA_MS),
      status: 'PENDING',
      resolvedAt: null,
      chatId: manager.tgUserId,
      messageId: int(1000, 99_999),
    })

    leads.push({
      id: leadId,
      createdAt,
      ...contact,
      category,
      urgency,
      answers: { category, urgency, contact: contact.contactPhone, comment },
      comment,
      status: 'ASSIGNED',
      takenById: null,
      takenAt: null,
      closedAt: null,
      lostAt: null,
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Запись
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Чистим демо-данные…')
  // Порядок важен: Assignment ссылается на Lead и Manager.
  await prisma.assignment.deleteMany()
  await prisma.lead.deleteMany()
  await prisma.manager.deleteMany()
  await prisma.outboxJob.deleteMany()

  console.log('Менеджеры…')
  await prisma.manager.createMany({ data: MANAGERS })

  console.log('Заявки…')
  const createdDates: Date[] = []
  for (let i = 0; i < HISTORICAL_LEADS; i += 1) createdDates.push(sampleCreatedAt())
  createdDates.sort((a, b) => a.getTime() - b.getTime())
  const plan = buildOutcomePlan(HISTORICAL_LEADS)
  createdDates.forEach((createdAt, i) => buildLead(createdAt, plan[i]))
  buildLiveLeads()

  await prisma.lead.createMany({
    data: leads.map((lead) => ({
      ...lead,
      answers: lead.answers as never,
    })),
  })

  console.log('Назначения…')
  await prisma.assignment.createMany({ data: assignments })

  console.log('Настройки…')
  const defaults: Record<string, string> = {
    slaMinutes: String(SLA_MINUTES),
    maxAttempts: String(MAX_ATTEMPTS),
  }
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }

  await report()
}

async function report(): Promise<void> {
  const [managerCount, leadCount, assignmentCount] = await Promise.all([
    prisma.manager.count(),
    prisma.lead.count(),
    prisma.assignment.count(),
  ])

  const byLeadStatus = await prisma.lead.groupBy({ by: ['status'], _count: { _all: true } })
  const byAssignmentStatus = await prisma.assignment.groupBy({
    by: ['status'],
    _count: { _all: true },
  })

  const taken = await prisma.lead.count({ where: { status: { in: ['TAKEN', 'CLOSED'] } } })
  const firstAttempt = await prisma.assignment.count({
    where: { status: 'ACCEPTED', attempt: 1 },
  })

  console.log('\n── Готово ───────────────────────────────')
  console.log(`Менеджеры:   ${managerCount}`)
  console.log(`Заявки:      ${leadCount}`)
  console.log(`Назначения:  ${assignmentCount}`)
  console.log(
    'Статусы заявок:     ' +
      byLeadStatus.map((r) => `${r.status}=${r._count._all}`).join('  '),
  )
  console.log(
    'Статусы назначений: ' +
      byAssignmentStatus.map((r) => `${r.status}=${r._count._all}`).join('  '),
  )
  if (taken > 0) {
    console.log(`С первой попытки:   ${Math.round((firstAttempt / taken) * 100)}% от взятых`)
  }
  console.log('─────────────────────────────────────────\n')
}

main()
  .catch((error) => {
    console.error('Сид упал:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

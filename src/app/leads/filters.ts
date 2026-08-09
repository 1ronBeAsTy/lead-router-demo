import { CATEGORIES } from '@/config/questions'
import type { LeadStatusLike } from '@/core/stats'
import type { Prisma } from '@/db/client'

/**
 * Фильтры живут в query-параметрах, а не в состоянии компонента: ссылка на
 * «потерянные заявки по установке за прошлую неделю» должна открываться у
 * коллеги ровно тем же экраном. Разбор и сборка — здесь, чтобы страница и
 * выгрузка CSV гарантированно смотрели на одну и ту же выборку.
 */

export const LEAD_STATUSES: readonly LeadStatusLike[] = ['NEW', 'ASSIGNED', 'TAKEN', 'CLOSED', 'LOST']
export const PAGE_SIZE = 25

export interface LeadFilters {
  status: LeadStatusLike | null
  category: string | null
  managerId: string | null
  /** `YYYY-MM-DD`, включительно с обеих сторон. */
  from: string | null
  to: string | null
  page: number
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function toSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value[0])
    } else if (value !== undefined) {
      params.set(key, value)
    }
  }
  return params
}

function readDay(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key)?.trim()
  return raw && DAY_RE.test(raw) ? raw : null
}

export function parseLeadFilters(params: URLSearchParams): LeadFilters {
  const status = params.get('status')
  const category = params.get('category')?.trim() ?? ''
  const page = Number(params.get('page'))

  return {
    status: LEAD_STATUSES.includes(status as LeadStatusLike) ? (status as LeadStatusLike) : null,
    category: CATEGORIES.includes(category) ? category : null,
    managerId: params.get('manager')?.trim() || null,
    from: readDay(params, 'from'),
    to: readDay(params, 'to'),
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  }
}

function localDay(iso: string, shiftDays = 0): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day + shiftDays)
}

export function leadWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {}

  if (filters.status) where.status = filters.status
  if (filters.category) where.category = filters.category
  // Менеджер — тот, кому заявка уходила, а не только тот, кто её взял:
  // иначе из выборки выпадают отказы и молчание, ради которых и смотрят фильтр.
  if (filters.managerId) where.assignments = { some: { managerId: filters.managerId } }

  const createdAt: Prisma.DateTimeFilter = {}
  if (filters.from) createdAt.gte = localDay(filters.from)
  if (filters.to) createdAt.lt = localDay(filters.to, 1)
  if (createdAt.gte || createdAt.lt) where.createdAt = createdAt

  return where
}

export function hasAnyFilter(filters: LeadFilters): boolean {
  return Boolean(filters.status || filters.category || filters.managerId || filters.from || filters.to)
}

/** Собирает query-строку обратно; `page` можно переопределить для пагинации. */
export function buildQuery(filters: LeadFilters, overrides: { page?: number } = {}): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.category) params.set('category', filters.category)
  if (filters.managerId) params.set('manager', filters.managerId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)

  const page = overrides.page ?? filters.page
  if (page > 1) params.set('page', String(page))

  return params.toString()
}

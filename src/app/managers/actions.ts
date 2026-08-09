'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { CATEGORIES } from '@/config/questions'
import { prisma } from '@/db/client'
import { requireAuth } from '@/lib/auth'
import type { ActionState } from '@/components/ActionForm'

/**
 * CRUD менеджеров. Каждый экшен сам проверяет сессию — серверный экшен это
 * публичный POST-эндпоинт, и middleware для него не единственная защита.
 */

const NAME_LIMIT = 80

interface ManagerInput {
  name: string
  tgUserId: bigint
  priority: number
  categories: string[]
}

/** Ошибку возвращаем строкой, а не бросаем: её показывает форма рядом с кнопкой. */
function parseManagerInput(formData: FormData): ManagerInput | string {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return 'Укажите имя менеджера.'
  if (name.length > NAME_LIMIT) return `Имя длиннее ${NAME_LIMIT} символов.`

  const rawId = String(formData.get('tgUserId') ?? '').trim()
  if (!/^\d{1,19}$/.test(rawId)) return 'Telegram ID — это целое положительное число.'
  const tgUserId = BigInt(rawId)
  if (tgUserId <= 0n) return 'Telegram ID — это целое положительное число.'

  const rawPriority = String(formData.get('priority') ?? '0').trim()
  const priority = Number(rawPriority)
  if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
    return 'Приоритет — целое число от 0 до 1000.'
  }

  // Категории приходят чекбоксами; чужие значения молча отбрасываем.
  const categories = formData
    .getAll('categories')
    .map(String)
    .filter((category) => CATEGORIES.includes(category))

  return { name, tgUserId, priority, categories }
}

function refresh(): void {
  revalidatePath('/managers')
  revalidatePath('/leads')
  revalidatePath('/')
}

function duplicateIdMessage(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    ? 'Менеджер с таким Telegram ID уже есть.'
    : null
}

export async function createManager(
  _state: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth()

  const input = parseManagerInput(formData)
  if (typeof input === 'string') return { error: input }

  try {
    await prisma.manager.create({ data: input })
  } catch (error) {
    const duplicate = duplicateIdMessage(error)
    if (duplicate) return { error: duplicate }
    throw error
  }

  refresh()
  return { ok: `Менеджер «${input.name}» добавлен.` }
}

export async function updateManager(
  _state: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth()

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Не понял, какого менеджера сохранять.' }

  const input = parseManagerInput(formData)
  if (typeof input === 'string') return { error: input }

  try {
    await prisma.manager.update({ where: { id }, data: input })
  } catch (error) {
    const duplicate = duplicateIdMessage(error)
    if (duplicate) return { error: duplicate }
    throw error
  }

  refresh()
  return { ok: 'Сохранено.' }
}

export async function toggleManager(
  _state: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth()

  const id = String(formData.get('id') ?? '')
  const manager = await prisma.manager.findUnique({ where: { id }, select: { isActive: true } })
  if (!manager) return { error: 'Менеджер не найден.' }

  await prisma.manager.update({ where: { id }, data: { isActive: !manager.isActive } })
  refresh()

  return { ok: manager.isActive ? 'Выключен — новые заявки не пойдут.' : 'Включён в маршрутизацию.' }
}

export async function deleteManager(
  _state: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth()

  const id = String(formData.get('id') ?? '')
  const assignments = await prisma.assignment.count({ where: { managerId: id } })
  if (assignments > 0) {
    // История назначений — это статистика; удаление менеджера порвало бы её.
    return {
      error: `У менеджера ${assignments} назначений в истории — его можно только выключить.`,
    }
  }

  try {
    await prisma.manager.delete({ where: { id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return { error: 'На менеджере висят заявки — сначала выключите его.' }
    }
    throw error
  }
  refresh()

  return { ok: 'Менеджер удалён.' }
}

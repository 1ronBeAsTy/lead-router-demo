'use server'

import { revalidatePath } from 'next/cache'
import { setSettings, type SettingKey } from '@/config/settings'
import { requireAuth } from '@/lib/auth'
import type { ActionState } from '@/components/ActionForm'

/**
 * Настройки читает и бот, и тикер — поэтому мусор сюда попасть не должен:
 * SLA в ноль минут превратит эскалацию в бесконечный цикл, а ноль попыток
 * означает, что заявка не уйдёт никому.
 */

function positiveInt(raw: FormDataEntryValue | null, label: string, max: number): number | string {
  const text = String(raw ?? '').trim()
  const value = Number(text)
  if (!text || !Number.isInteger(value) || value < 1 || value > max) {
    return `${label} — целое число от 1 до ${max}.`
  }
  return value
}

export async function saveSettings(
  _state: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth()

  const slaMinutes = positiveInt(formData.get('slaMinutes'), 'SLA', 24 * 60)
  if (typeof slaMinutes === 'string') return { error: slaMinutes }

  const maxAttempts = positiveInt(formData.get('maxAttempts'), 'Число попыток', 20)
  if (typeof maxAttempts === 'string') return { error: maxAttempts }

  const sheetId = String(formData.get('sheetId') ?? '').trim()
  if (sheetId && !/^[\w-]{10,120}$/.test(sheetId)) {
    return { error: 'ID таблицы — это кусок ссылки между /d/ и /edit, без слэшей.' }
  }

  // Чат эскалации может быть группой — у неё ID отрицательный.
  const escalationChatId = String(formData.get('escalationChatId') ?? '').trim()
  if (escalationChatId && !/^-?\d{1,19}$/.test(escalationChatId)) {
    return { error: 'Чат эскалации — числовой ID, у групп он с минусом.' }
  }

  const patch: Partial<Record<SettingKey, string>> = {
    slaMinutes: String(slaMinutes),
    maxAttempts: String(maxAttempts),
    sheetId,
    escalationChatId,
  }

  await setSettings(patch)
  revalidatePath('/settings')
  revalidatePath('/')

  return { ok: 'Сохранено. Бот и тикер подхватят настройки в течение пяти секунд.' }
}

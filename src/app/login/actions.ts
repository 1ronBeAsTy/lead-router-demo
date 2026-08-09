'use server'

import { redirect } from 'next/navigation'
import { checkPassword, safeRedirectTarget, startSession } from '@/lib/auth'
import type { ActionState } from '@/components/ActionForm'

export async function login(_state: ActionState | null, formData: FormData): Promise<ActionState> {
  const password = String(formData.get('password') ?? '')
  if (!password) return { error: 'Введите пароль.' }

  if (!checkPassword(password)) {
    return { error: 'Неверный пароль. Проверьте раскладку и регистр.' }
  }

  await startSession()
  // redirect бросает исключение — код после него не выполняется, это нормально.
  redirect(safeRedirectTarget(String(formData.get('from') ?? '')))
}

'use client'

import { useActionState, useEffect, useRef, type ReactNode } from 'react'

/**
 * Все мутации в админке — серверные экшены. Клиентского тут ровно столько,
 * сколько нужно, чтобы показать результат: `useActionState` держит ответ экшена,
 * а кнопка знает про `pending` и не даёт отправить форму дважды.
 */

export interface ActionState {
  ok?: string
  error?: string
}

export type FormAction = (state: ActionState | null, formData: FormData) => Promise<ActionState>

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  className = '',
  submitClassName = 'btn btn-primary',
  controlsClassName = 'mt-3 flex flex-wrap items-center gap-3',
  extraActions,
  confirmText,
  resetOnSuccess = false,
}: {
  action: FormAction
  children?: ReactNode
  submitLabel: string
  pendingLabel?: string
  className?: string
  submitClassName?: string
  controlsClassName?: string
  extraActions?: ReactNode
  confirmText?: string
  resetOnSuccess?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault()
      }}
    >
      {children}
      <div className={controlsClassName}>
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? (pendingLabel ?? 'Сохраняем…') : submitLabel}
        </button>
        {extraActions}
        {state?.error ? (
          <p role="alert" className="text-[13px] text-bad">
            {state.error}
          </p>
        ) : null}
        {state?.ok ? (
          <p role="status" className="text-[13px] text-ok">
            {state.ok}
          </p>
        ) : null}
      </div>
    </form>
  )
}

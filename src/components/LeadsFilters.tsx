'use client'

import { useRef } from 'react'
import { LEAD_STATUS_LABEL } from './format'
import type { LeadStatusLike } from '@/core/stats'

export interface ManagerOption {
  id: string
  name: string
  isActive: boolean
}

export interface FiltersValue {
  status: LeadStatusLike | null
  category: string | null
  managerId: string | null
  from: string | null
  to: string | null
}

/**
 * Обычная GET-форма: submit кладёт значения в адресную строку, а не в состояние,
 * — поэтому ссылка шарабельна, а кнопка «назад» работает сама собой.
 * Клиентского кода тут ровно на автосабмит по изменению селекта.
 */
export function LeadsFilters({
  value,
  managers,
  categories,
  resultCount,
}: {
  value: FiltersValue
  managers: ManagerOption[]
  categories: readonly string[]
  resultCount: number
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const submit = () => formRef.current?.requestSubmit()

  const dirty = Boolean(value.status || value.category || value.managerId || value.from || value.to)

  return (
    <form
      ref={formRef}
      method="get"
      action="/leads"
      className="panel px-4 py-3"
      // Пустые поля выключаем перед отправкой — иначе в адресе повисает
      // «?status=&category=&manager=», и ссылкой такое стыдно делиться.
      onSubmit={(event) => {
        for (const element of Array.from(event.currentTarget.elements)) {
          const field = element as HTMLInputElement | HTMLSelectElement
          if (field.name && 'value' in field && field.value === '') field.disabled = true
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div>
          <label className="label" htmlFor="f-status">
            Статус
          </label>
          <select
            id="f-status"
            name="status"
            defaultValue={value.status ?? ''}
            onChange={submit}
            className="input"
          >
            <option value="">Любой</option>
            {(Object.keys(LEAD_STATUS_LABEL) as LeadStatusLike[]).map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-category">
            Категория
          </label>
          <select
            id="f-category"
            name="category"
            defaultValue={value.category ?? ''}
            onChange={submit}
            className="input"
          >
            <option value="">Любая</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-manager">
            Менеджер
          </label>
          <select
            id="f-manager"
            name="manager"
            defaultValue={value.managerId ?? ''}
            onChange={submit}
            className="input"
          >
            <option value="">Любой</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
                {manager.isActive ? '' : ' (выключен)'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-from">
            Создана с
          </label>
          <input
            id="f-from"
            type="date"
            name="from"
            defaultValue={value.from ?? ''}
            onChange={submit}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="f-to">
            по
          </label>
          <input
            id="f-to"
            type="date"
            name="to"
            defaultValue={value.to ?? ''}
            onChange={submit}
            className="input"
          />
        </div>

        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary flex-1">
            Показать
          </button>
          {dirty ? (
            <a href="/leads" className="btn btn-quiet">
              Сброс
            </a>
          ) : null}
        </div>
      </div>

      <p className="mt-2.5 text-xs text-ink-3 tabular-nums">
        {dirty ? `Под фильтр попало ${resultCount}` : `Всего заявок ${resultCount}`}
      </p>
    </form>
  )
}

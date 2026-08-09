import Link from 'next/link'
import { formatNumber } from './format'

/** Ссылки, а не кнопки: страница остаётся в URL и переживает перезагрузку и пересылку. */
export function Pagination({
  page,
  pageSize,
  pageCount,
  total,
  hrefFor,
}: {
  page: number
  pageSize: number
  pageCount: number
  total: number
  hrefFor: (page: number) => string
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <span className="text-xs text-ink-3 tabular-nums">
        {total === 0
          ? 'Ничего не найдено'
          : `${formatNumber(first)}–${formatNumber(last)} из ${formatNumber(total)}`}
        <span className="mx-2 text-line-strong">·</span>
        стр. {formatNumber(page)} из {formatNumber(Math.max(1, pageCount))}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="btn btn-sm">
            ← Назад
          </Link>
        ) : (
          <span className="btn btn-sm pointer-events-none opacity-45">← Назад</span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className="btn btn-sm">
            Вперёд →
          </Link>
        ) : (
          <span className="btn btn-sm pointer-events-none opacity-45">Вперёд →</span>
        )}
      </div>
    </div>
  )
}

import { formatDuration, formatTime, type AssignmentStatusLike } from './format'
import { AssignmentStatusBadge } from './ui'

/**
 * Цепочка попыток по заявке: кому уходило, когда и чем кончилось.
 * Это главное, ради чего в ленте вообще стоит смотреть строку, — по ней видно,
 * почему заявка провисела двадцать минут и на ком остановилась эскалация.
 */
export interface AttemptView {
  id: string
  attempt: number
  managerName: string
  sentAt: Date
  resolvedAt: Date | null
  status: AssignmentStatusLike
}

export function AttemptChain({ attempts }: { attempts: AttemptView[] }) {
  if (attempts.length === 0) {
    return <span className="text-xs text-ink-3">ещё не рассылалась</span>
  }

  return (
    <ol className="space-y-1">
      {attempts.map((attempt) => (
        <li key={attempt.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded border border-line bg-surface-2 text-[10px] font-medium text-ink-3 tabular-nums">
            {attempt.attempt}
          </span>
          <span className="text-ink-2">{attempt.managerName}</span>
          <span className="text-ink-3 tabular-nums">{formatTime(attempt.sentAt)}</span>
          <AssignmentStatusBadge status={attempt.status} />
          {attempt.resolvedAt && attempt.status !== 'PENDING' ? (
            <span className="text-ink-3 tabular-nums">
              {formatDuration(attempt.resolvedAt.getTime() - attempt.sentAt.getTime())}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

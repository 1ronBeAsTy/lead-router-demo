import type { ReactNode } from 'react'
import type { LeadStatusLike } from '@/core/stats'
import {
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_TONE,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
  TONE_BADGE,
  TONE_TEXT,
  type AssignmentStatusLike,
  type Tone,
} from './format'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Panel({
  title,
  hint,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      {title || actions ? (
        <header className="panel-head">
          <div className="min-w-0">
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {hint ? <div className="mt-0.5 text-[11px] text-ink-3">{hint}</div> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
      <div
        aria-hidden
        className="mb-2 h-8 w-8 rounded-full border border-dashed border-line-strong"
      />
      <p className="text-[13px] font-medium text-ink-2">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-ink-3">{hint}</p> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: Tone
}) {
  return (
    <div className="panel px-3.5 py-3">
      <div className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{label}</div>
      <div className={`mt-1.5 text-[26px] leading-8 font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      <div className="mt-0.5 min-h-4 text-[11px] text-ink-3">{hint ?? ''}</div>
    </div>
  )
}

export function LeadStatusBadge({ status }: { status: LeadStatusLike }) {
  return (
    <span className={`badge ${TONE_BADGE[LEAD_STATUS_TONE[status]]}`}>
      {LEAD_STATUS_LABEL[status]}
    </span>
  )
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatusLike }) {
  return (
    <span className={`badge ${TONE_BADGE[ASSIGNMENT_STATUS_TONE[status]]}`}>
      {ASSIGNMENT_STATUS_LABEL[status]}
    </span>
  )
}

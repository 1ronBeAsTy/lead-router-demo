import Link from 'next/link'
import { getSettings } from '@/config/settings'
import { bucketByDay, summarize, type LeadStatRow } from '@/core/stats'
import { prisma } from '@/db/client'
import { requireAuth } from '@/lib/auth'
import { ChartLegend, LeadsChart, type ChartPoint } from '@/components/LeadsChart'
import {
  formatDateTime,
  formatDayLabel,
  formatDuration,
  formatNumber,
  formatPercent,
  plural,
} from '@/components/format'
import { EmptyState, LeadStatusBadge, PageHeader, Panel, StatCard } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Дашборд' }

const CHART_DAYS = 14
const RECENT_LIMIT = 20

export default async function DashboardPage() {
  await requireAuth()

  const now = new Date()

  const [statRows, recent, settings, activeManagers] = await Promise.all([
    prisma.lead.findMany({
      select: {
        id: true,
        createdAt: true,
        status: true,
        takenAt: true,
        takenById: true,
        _count: { select: { assignments: true } },
      },
    }),
    prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: {
        id: true,
        createdAt: true,
        contactName: true,
        contactUser: true,
        contactPhone: true,
        category: true,
        urgency: true,
        status: true,
        takenBy: { select: { name: true } },
        _count: { select: { assignments: true } },
      },
    }),
    getSettings(),
    prisma.manager.count({ where: { isActive: true } }),
  ])

  // `summarize` и `bucketByDay` — готовые агрегаты из ядра; страница только
  // подаёт им строки и раскладывает результат по карточкам.
  const rows: LeadStatRow[] = statRows.map((lead) => ({
    id: lead.id,
    createdAt: lead.createdAt,
    status: lead.status,
    takenAt: lead.takenAt,
    takenById: lead.takenById,
    attempts: lead._count.assignments,
  }))

  const summary = summarize(rows, now)
  const series: ChartPoint[] = bucketByDay(rows, CHART_DAYS, now).map((bucket) => ({
    date: bucket.date,
    label: formatDayLabel(bucket.date),
    total: bucket.total,
    taken: bucket.taken,
    lost: bucket.lost,
    open: Math.max(0, bucket.total - bucket.taken - bucket.lost),
  }))

  const yesterdayCount = series.at(-2)?.total ?? 0
  const takenShare = summary.totalCount === 0 ? null : summary.takenCount / summary.totalCount
  const lostShare = summary.totalCount === 0 ? null : summary.lostCount / summary.totalCount

  return (
    <>
      <PageHeader
        title="Дашборд"
        subtitle={`SLA ${settings.slaMinutes} мин · до ${settings.maxAttempts} ${plural(
          settings.maxAttempts,
          ['попытки', 'попыток', 'попыток'],
        )} · ${activeManagers} ${plural(activeManagers, [
          'активный менеджер',
          'активных менеджера',
          'активных менеджеров',
        ])}`}
        actions={
          <Link href="/leads" className="btn btn-sm">
            Все заявки →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Сегодня"
          value={formatNumber(summary.todayCount)}
          hint={`вчера ${formatNumber(yesterdayCount)}`}
        />
        <StatCard
          label="За 7 дней"
          value={formatNumber(summary.weekCount)}
          hint={`всего в базе ${formatNumber(summary.totalCount)}`}
        />
        <StatCard
          label="Взято"
          value={formatNumber(summary.takenCount)}
          hint={`${formatPercent(takenShare)} от всех · в работе ${formatNumber(summary.openCount)}`}
          tone="ok"
        />
        <StatCard
          label="Потеряно"
          value={formatNumber(summary.lostCount)}
          hint={`${formatPercent(lostShare)} от всех — цепочка исчерпана`}
          tone="bad"
        />
        <StatCard
          label="Время до «Беру»"
          value={formatDuration(summary.avgFirstResponseMs)}
          hint={`медиана ${formatDuration(summary.medianFirstResponseMs)}`}
        />
        <StatCard
          label="С первой попытки"
          value={formatPercent(summary.firstAttemptShare)}
          hint="доля взятых без переадресации"
        />
      </div>

      <div className="mt-3 grid gap-3">
        <Panel
          title={`Поток заявок, ${CHART_DAYS} ${plural(CHART_DAYS, ['день', 'дня', 'дней'])}`}
          hint="по дню создания заявки"
          actions={<ChartLegend />}
        >
          <LeadsChart data={series} />
        </Panel>

        <Panel
          title="Последние заявки"
          hint={`${RECENT_LIMIT} свежих`}
          actions={
            <Link href="/leads" className="btn btn-sm">
              Открыть ленту
            </Link>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              title="Заявок пока нет"
              hint="Как только бот примет первую анкету, она появится здесь."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line bg-surface-2">
                    <th className="th">Создана</th>
                    <th className="th">Контакт</th>
                    <th className="th">Категория</th>
                    <th className="th">Срочность</th>
                    <th className="th">Статус</th>
                    <th className="th">Менеджер</th>
                    <th className="th text-right">Попыток</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((lead) => (
                    <tr key={lead.id} className="row-hover border-b border-line last:border-0">
                      <td className="td whitespace-nowrap text-ink-2 tabular-nums">
                        {formatDateTime(lead.createdAt)}
                      </td>
                      <td className="td">
                        <div className="font-medium">{lead.contactName}</div>
                        <div className="text-xs text-ink-3">
                          {lead.contactUser ? `@${lead.contactUser}` : (lead.contactPhone ?? '—')}
                        </div>
                      </td>
                      <td className="td whitespace-nowrap text-ink-2">{lead.category}</td>
                      <td className="td whitespace-nowrap text-ink-3">{lead.urgency}</td>
                      <td className="td">
                        <LeadStatusBadge status={lead.status} />
                      </td>
                      <td className="td whitespace-nowrap text-ink-2">
                        {lead.takenBy?.name ?? <span className="text-ink-3">—</span>}
                      </td>
                      <td className="td text-right text-ink-2 tabular-nums">
                        {lead._count.assignments}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

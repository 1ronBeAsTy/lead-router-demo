import { CATEGORIES } from '@/config/questions'
import { prisma } from '@/db/client'
import { requireAuth } from '@/lib/auth'
import { AttemptChain, type AttemptView } from '@/components/AttemptChain'
import { LeadsFilters } from '@/components/LeadsFilters'
import { Pagination } from '@/components/Pagination'
import { formatDate, formatTime } from '@/components/format'
import { EmptyState, LeadStatusBadge, PageHeader, Panel } from '@/components/ui'
import {
  PAGE_SIZE,
  buildQuery,
  hasAnyFilter,
  leadWhere,
  parseLeadFilters,
  toSearchParams,
} from './filters'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Заявки' }

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAuth()

  const params = toSearchParams(await searchParams)
  const filters = parseLeadFilters(params)
  const where = leadWhere(filters)

  const [total, managers] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.manager.findMany({
      orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(filters.page, pageCount)

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      contactName: true,
      contactUser: true,
      contactPhone: true,
      category: true,
      urgency: true,
      comment: true,
      status: true,
      takenAt: true,
      takenBy: { select: { name: true } },
      assignments: {
        orderBy: { attempt: 'asc' },
        select: {
          id: true,
          attempt: true,
          sentAt: true,
          resolvedAt: true,
          status: true,
          manager: { select: { name: true } },
        },
      },
    },
  })

  const exportQuery = buildQuery(filters, { page: 1 })
  const hrefFor = (target: number) => {
    const query = buildQuery(filters, { page: target })
    return query ? `/leads?${query}` : '/leads'
  }

  return (
    <>
      <PageHeader
        title="Заявки"
        subtitle="Лента с цепочками назначений: кому уходило, когда и чем кончилось"
        actions={
          <a
            className="btn btn-sm"
            href={exportQuery ? `/api/leads/export?${exportQuery}` : '/api/leads/export'}
            download
          >
            Выгрузить CSV
          </a>
        }
      />

      <LeadsFilters
        value={filters}
        managers={managers}
        categories={CATEGORIES}
        resultCount={total}
      />

      <Panel className="mt-3">
        {leads.length === 0 ? (
          <EmptyState
            title={hasAnyFilter(filters) ? 'Под фильтр ничего не попало' : 'Заявок пока нет'}
            hint={
              hasAnyFilter(filters)
                ? 'Ослабьте условия или сбросьте фильтр — данные никуда не делись.'
                : 'Первая же анкета, принятая ботом, появится в этой ленте.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="th">Создана</th>
                  <th className="th">Контакт</th>
                  <th className="th">Заявка</th>
                  <th className="th">Статус</th>
                  <th className="th">Цепочка попыток</th>
                  <th className="th">Взял</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const attempts: AttemptView[] = lead.assignments.map((assignment) => ({
                    id: assignment.id,
                    attempt: assignment.attempt,
                    managerName: assignment.manager.name,
                    sentAt: assignment.sentAt,
                    resolvedAt: assignment.resolvedAt,
                    status: assignment.status,
                  }))

                  return (
                    <tr key={lead.id} className="row-hover border-b border-line last:border-0">
                      <td className="td whitespace-nowrap tabular-nums">
                        <div>{formatDate(lead.createdAt)}</div>
                        <div className="text-xs text-ink-3">{formatTime(lead.createdAt)}</div>
                      </td>
                      <td className="td min-w-40">
                        <div className="font-medium">{lead.contactName}</div>
                        <div className="text-xs text-ink-3">
                          {lead.contactUser ? `@${lead.contactUser}` : null}
                          {lead.contactUser && lead.contactPhone ? ' · ' : null}
                          {lead.contactPhone ?? null}
                          {!lead.contactUser && !lead.contactPhone ? '—' : null}
                        </div>
                      </td>
                      <td className="td min-w-56 max-w-80">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="badge badge-neutral">{lead.category}</span>
                          <span className="text-xs text-ink-3">{lead.urgency}</span>
                        </div>
                        {lead.comment ? (
                          <p className="mt-1 line-clamp-2 text-xs text-ink-2">{lead.comment}</p>
                        ) : null}
                      </td>
                      <td className="td">
                        <LeadStatusBadge status={lead.status} />
                      </td>
                      <td className="td min-w-72">
                        <AttemptChain attempts={attempts} />
                      </td>
                      <td className="td whitespace-nowrap">
                        {lead.takenBy ? (
                          <>
                            <div className="text-ink-2">{lead.takenBy.name}</div>
                            {lead.takenAt ? (
                              <div className="text-xs text-ink-3 tabular-nums">
                                {formatTime(lead.takenAt)}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          pageCount={pageCount}
          total={total}
          hrefFor={hrefFor}
        />
      </Panel>
    </>
  )
}

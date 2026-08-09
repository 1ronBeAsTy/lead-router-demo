import { CATEGORIES } from '@/config/questions'
import { summarizeManagers, type AssignmentStatRow, type ManagerStatRow } from '@/core/stats'
import { prisma } from '@/db/client'
import { requireAuth } from '@/lib/auth'
import { bigintToString } from '@/lib/serialize'
import { ActionForm } from '@/components/ActionForm'
import { formatDuration, formatNumber, formatPercent, plural } from '@/components/format'
import { EmptyState, PageHeader, Panel } from '@/components/ui'
import { createManager, deleteManager, toggleManager, updateManager } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Менеджеры' }

interface ManagerView {
  id: string
  name: string
  tgUserId: string
  categories: string[]
  isActive: boolean
  priority: number
  stat: ManagerStatRow | null
}

const EMPTY_STAT: ManagerStatRow = {
  managerId: '',
  assigned: 0,
  accepted: 0,
  declined: 0,
  expired: 0,
  closed: 0,
  avgResponseMs: null,
}

export default async function ManagersPage() {
  await requireAuth()

  const [managers, assignmentRows] = await Promise.all([
    prisma.manager.findMany({
      orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    }),
    prisma.assignment.findMany({
      select: {
        managerId: true,
        status: true,
        sentAt: true,
        resolvedAt: true,
        lead: { select: { status: true } },
      },
    }),
  ])

  const statRows: AssignmentStatRow[] = assignmentRows.map((row) => ({
    managerId: row.managerId,
    status: row.status,
    sentAt: row.sentAt,
    resolvedAt: row.resolvedAt,
    leadClosed: row.lead.status === 'CLOSED',
  }))

  const stats = new Map(summarizeManagers(statRows).map((stat) => [stat.managerId, stat]))

  // tgUserId — BigInt: в разметку и в клиентские формы он уходит только строкой.
  const views: ManagerView[] = managers.map((manager) => ({
    id: manager.id,
    name: manager.name,
    tgUserId: bigintToString(manager.tgUserId),
    categories: manager.categories,
    isActive: manager.isActive,
    priority: manager.priority,
    stat: stats.get(manager.id) ?? null,
  }))

  const activeCount = views.filter((view) => view.isActive).length

  return (
    <>
      <PageHeader
        title="Менеджеры"
        subtitle={`${activeCount} из ${views.length} в маршрутизации · заявка уходит по убыванию приоритета, при равном — наименее загруженному`}
      />

      <Panel title="Добавить менеджера" hint="Telegram ID нужен, чтобы бот знал, куда слать карточку">
        <ActionForm
          action={createManager}
          submitLabel="Добавить"
          pendingLabel="Добавляем…"
          resetOnSuccess
          className="px-4 py-3"
          controlsClassName="mt-3 flex flex-wrap items-center gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_auto_2fr]">
            <div>
              <label className="label" htmlFor="new-name">
                Имя
              </label>
              <input id="new-name" name="name" className="input" placeholder="Ирина Соколова" />
            </div>
            <div>
              <label className="label" htmlFor="new-tg">
                Telegram ID
              </label>
              <input
                id="new-tg"
                name="tgUserId"
                inputMode="numeric"
                className="input tabular-nums"
                placeholder="512884017"
              />
            </div>
            <div className="w-28">
              <label className="label" htmlFor="new-priority">
                Приоритет
              </label>
              <input
                id="new-priority"
                name="priority"
                type="number"
                min={0}
                max={1000}
                defaultValue={0}
                className="input tabular-nums"
              />
            </div>
            <div>
              <span className="label">Категории</span>
              <CategoryChecks name="categories" selected={[]} idPrefix="new" />
            </div>
          </div>
        </ActionForm>
      </Panel>

      {views.length === 0 ? (
        <Panel className="mt-3">
          <EmptyState
            title="Менеджеров нет"
            hint="Пока в списке пусто, бот принимает заявки, но отправлять их некому."
          />
        </Panel>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {views.map((view) => (
            <ManagerCard key={view.id} view={view} />
          ))}
        </div>
      )}
    </>
  )
}

function CategoryChecks({
  name,
  selected,
  idPrefix,
}: {
  name: string
  selected: string[]
  idPrefix: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((category) => {
        const id = `${idPrefix}-cat-${category}`
        return (
          <label
            key={category}
            htmlFor={id}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-ink"
          >
            <input
              id={id}
              type="checkbox"
              name={name}
              value={category}
              defaultChecked={selected.includes(category)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {category}
          </label>
        )
      })}
    </div>
  )
}

function Metric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-ink-3 uppercase">{label}</dt>
      <dd className={`text-[15px] font-semibold tabular-nums ${tone || 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function ManagerCard({ view }: { view: ManagerView }) {
  const stat = view.stat ?? EMPTY_STAT
  const acceptShare = stat.assigned === 0 ? null : stat.accepted / stat.assigned

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">{view.name}</h2>
            <span className={`badge ${view.isActive ? 'badge-ok' : 'badge-neutral'}`}>
              {view.isActive ? 'в маршрутизации' : 'выключен'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            <span className="tabular-nums">ID {view.tgUserId}</span>
            <span className="text-line-strong">·</span>
            <span className="tabular-nums">приоритет {view.priority}</span>
            <span className="text-line-strong">·</span>
            <span>
              {view.categories.length > 0 ? view.categories.join(', ') : 'без категорий'}
            </span>
          </div>
        </div>

        <ActionForm
          action={toggleManager}
          submitLabel={view.isActive ? 'Выключить' : 'Включить'}
          pendingLabel="…"
          submitClassName="btn btn-sm"
          controlsClassName="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="id" value={view.id} />
        </ActionForm>
      </header>

      <dl className="grid grid-cols-3 gap-y-3 border-b border-line px-4 py-3 sm:grid-cols-6">
        <Metric label="ушло" value={formatNumber(stat.assigned)} />
        <Metric label="взял" value={formatNumber(stat.accepted)} tone="text-ok" />
        <Metric label="отказ" value={formatNumber(stat.declined)} />
        <Metric label="молчал" value={formatNumber(stat.expired)} tone="text-bad" />
        <Metric label="закрыл" value={formatNumber(stat.closed)} />
        <Metric label="реакция" value={formatDuration(stat.avgResponseMs)} />
      </dl>

      <p className="px-4 py-2 text-xs text-ink-3">
        {stat.assigned === 0
          ? 'Назначений ещё не было.'
          : `Берёт ${formatPercent(acceptShare)} того, что приходит, в среднем за ${formatDuration(
              stat.avgResponseMs,
            )}.`}
      </p>

      <details className="group mt-auto border-t border-line">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-ink-2 transition-colors select-none hover:bg-surface-2 hover:text-ink">
          <span className="text-ink-3 transition-transform group-open:rotate-90">›</span>
          Изменить
        </summary>

        <div className="border-t border-line bg-surface-2 px-4 py-3">
          <ActionForm
            action={updateManager}
            submitLabel="Сохранить"
            controlsClassName="mt-3 flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="id" value={view.id} />
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
              <div>
                <label className="label" htmlFor={`name-${view.id}`}>
                  Имя
                </label>
                <input
                  id={`name-${view.id}`}
                  name="name"
                  defaultValue={view.name}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor={`tg-${view.id}`}>
                  Telegram ID
                </label>
                <input
                  id={`tg-${view.id}`}
                  name="tgUserId"
                  inputMode="numeric"
                  defaultValue={view.tgUserId}
                  className="input tabular-nums"
                />
              </div>
              <div className="w-28">
                <label className="label" htmlFor={`priority-${view.id}`}>
                  Приоритет
                </label>
                <input
                  id={`priority-${view.id}`}
                  name="priority"
                  type="number"
                  min={0}
                  max={1000}
                  defaultValue={view.priority}
                  className="input tabular-nums"
                />
              </div>
            </div>
            <div className="mt-3">
              <span className="label">
                Категории — {view.categories.length}{' '}
                {plural(view.categories.length, ['выбрана', 'выбраны', 'выбрано'])}
              </span>
              <CategoryChecks
                name="categories"
                selected={view.categories}
                idPrefix={`m-${view.id}`}
              />
            </div>
          </ActionForm>

          {/* Отдельной формой, а не кнопкой внутри предыдущей: вложенные <form> браузер выбрасывает. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-xs text-ink-3">
              Удалить можно только менеджера без истории назначений.
            </p>
            <ActionForm
              action={deleteManager}
              submitLabel="Удалить"
              pendingLabel="Удаляем…"
              submitClassName="btn btn-sm btn-danger"
              controlsClassName="flex flex-wrap items-center gap-2"
              confirmText={`Удалить менеджера «${view.name}»?`}
            >
              <input type="hidden" name="id" value={view.id} />
            </ActionForm>
          </div>
        </div>
      </details>
    </section>
  )
}

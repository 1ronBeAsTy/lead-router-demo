import { getSettings } from '@/config/settings'
import { prisma } from '@/db/client'
import { requireAuth } from '@/lib/auth'
import { ActionForm } from '@/components/ActionForm'
import { formatNumber, plural } from '@/components/format'
import { PageHeader, Panel } from '@/components/ui'
import { saveSettings } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Настройки' }

export default async function SettingsPage() {
  await requireAuth()

  const [settings, pending, activeManagers] = await Promise.all([
    getSettings(),
    prisma.assignment.count({ where: { status: 'PENDING' } }),
    prisma.manager.count({ where: { isActive: true } }),
  ])

  return (
    <>
      <PageHeader
        title="Настройки"
        subtitle="Лежат в таблице Setting и подхватываются ботом на лету — перезапуск не нужен"
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Маршрутизация и SLA">
          <ActionForm
            action={saveSettings}
            submitLabel="Сохранить"
            className="px-4 py-4"
            controlsClassName="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="slaMinutes">
                  SLA, минут
                </label>
                <input
                  id="slaMinutes"
                  name="slaMinutes"
                  type="number"
                  min={1}
                  max={1440}
                  defaultValue={settings.slaMinutes}
                  className="input tabular-nums"
                />
                <p className="mt-1 text-xs text-ink-3">
                  Сколько менеджер думает над заявкой, прежде чем она уйдёт следующему.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="maxAttempts">
                  Попыток на заявку
                </label>
                <input
                  id="maxAttempts"
                  name="maxAttempts"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={settings.maxAttempts}
                  className="input tabular-nums"
                />
                <p className="mt-1 text-xs text-ink-3">
                  На скольких менеджерах цепочка обрывается и заявка считается потерянной.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="sheetId">
                  ID таблицы Google Sheets
                </label>
                <input
                  id="sheetId"
                  name="sheetId"
                  defaultValue={settings.sheetId ?? ''}
                  placeholder="1BxiMVs0XRA5nFMdKvBd..."
                  className="input font-mono text-xs"
                />
                <p className="mt-1 text-xs text-ink-3">
                  Кусок ссылки между <code className="text-ink-2">/d/</code> и{' '}
                  <code className="text-ink-2">/edit</code>. Пусто — выгрузка выключена.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="escalationChatId">
                  Чат эскалации
                </label>
                <input
                  id="escalationChatId"
                  name="escalationChatId"
                  inputMode="numeric"
                  defaultValue={settings.escalationChatId ?? ''}
                  placeholder="-1001234567890"
                  className="input tabular-nums"
                />
                <p className="mt-1 text-xs text-ink-3">
                  Куда падает заявка, которую никто не взял. У групп ID отрицательный.
                </p>
              </div>
            </div>
          </ActionForm>
        </Panel>

        <div className="grid gap-3 self-start">
          <Panel title="Что это меняет прямо сейчас">
            <dl className="divide-y divide-line text-[13px]">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-ink-2">Дедлайн одной попытки</dt>
                <dd className="font-medium tabular-nums">{settings.slaMinutes} мин</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-ink-2">Максимум ожидания</dt>
                <dd className="font-medium tabular-nums">
                  {formatNumber(settings.slaMinutes * settings.maxAttempts)} мин
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-ink-2">Сейчас ждут ответа</dt>
                <dd className="font-medium tabular-nums">
                  {formatNumber(pending)} {plural(pending, ['заявка', 'заявки', 'заявок'])}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-ink-2">Активных менеджеров</dt>
                <dd className="font-medium tabular-nums">{formatNumber(activeManagers)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-ink-2">Google Sheets</dt>
                <dd className={`font-medium ${settings.sheetId ? 'text-ok' : 'text-ink-3'}`}>
                  {settings.sheetId ? 'подключён' : 'выключен'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-ink-2">Эскалация в чат</dt>
                <dd
                  className={`font-medium ${settings.escalationChatId ? 'text-ok' : 'text-ink-3'}`}
                >
                  {settings.escalationChatId ? 'настроена' : 'выключена'}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Осторожно с попытками">
            <p className="px-4 py-3 text-xs leading-relaxed text-ink-2">
              Попытки умножаются на SLA: при {settings.slaMinutes} минутах и{' '}
              {settings.maxAttempts} попытках клиент в худшем случае ждёт{' '}
              {formatNumber(settings.slaMinutes * settings.maxAttempts)} минут, прежде чем заявка
              попадёт в потерянные. Уже разосланные назначения продолжают жить со старым
              дедлайном — новые настройки действуют на следующие.
            </p>
          </Panel>
        </div>
      </div>
    </>
  )
}

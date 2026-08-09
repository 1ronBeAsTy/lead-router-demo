import { redirect } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { isAuthenticated } from '@/lib/auth'
import { login } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Вход' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (await isAuthenticated()) redirect('/')

  const params = await searchParams
  const fromRaw = params.from
  const from = Array.isArray(fromRaw) ? fromRaw[0] : (fromRaw ?? '/')

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm font-bold text-on-accent">
            Л
          </span>
          <div>
            <div className="text-[15px] leading-tight font-semibold tracking-tight">Лид-роутер</div>
            <div className="text-xs text-ink-3">админка приёма заявок</div>
          </div>
        </div>

        <section className="panel px-5 py-5">
          <h1 className="text-[15px] font-semibold tracking-tight">Вход</h1>
          <p className="mt-1 mb-4 text-[13px] text-ink-3">
            Пароль один на всю админку и живёт в переменной{' '}
            <code className="text-ink-2">ADMIN_PASSWORD</code>.
          </p>

          <ActionForm
            action={login}
            submitLabel="Войти"
            pendingLabel="Проверяем…"
            submitClassName="btn btn-primary w-full"
            controlsClassName="mt-4 space-y-2"
          >
            <input type="hidden" name="from" value={from} />
            <label className="label" htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              className="input"
              placeholder="••••••••"
            />
          </ActionForm>
        </section>

        <p className="mt-3 text-center text-xs text-ink-3">
          Сессия живёт неделю в httpOnly-куке с подписью.
        </p>
      </div>
    </div>
  )
}

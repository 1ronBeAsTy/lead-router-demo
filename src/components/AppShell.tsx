'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { logout } from '@/app/actions'

const LINKS = [
  { href: '/', label: 'Дашборд' },
  { href: '/leads', label: 'Заявки' },
  { href: '/managers', label: 'Менеджеры' },
  { href: '/settings', label: 'Настройки' },
] as const

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Шапка одна на все разделы, но на экране входа её быть не должно — иначе
 * неавторизованный пользователь видит навигацию, которая никуда не ведёт.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login') {
    return <div className="min-h-dvh">{children}</div>
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-5 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-on-accent">
              Л
            </span>
            <span className="hidden text-[13px] leading-tight font-semibold tracking-tight sm:block">
              Лид-роутер
              <span className="block text-[11px] font-normal text-ink-3">приём и маршрутизация</span>
            </span>
          </Link>

          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-surface-3 text-ink'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <form action={logout} className="shrink-0">
            <button type="submit" className="btn btn-quiet btn-sm">
              Выйти
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}

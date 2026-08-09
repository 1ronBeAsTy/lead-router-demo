import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Заявки — админка',
    template: '%s · Заявки',
  },
  description:
    'Приём и маршрутизация заявок: дашборд, лента заявок с цепочками назначений, менеджеры и SLA.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f4f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env, isProd } from '@/config/env'

/**
 * Один пароль на всю админку — этого демо достаточно, отдельных пользователей тут нет.
 *
 * В куке лежит не пароль, а подписанный токен `v1.<expiresAt>.<hmac>`: подделать
 * его без `ADMIN_PASSWORD` нельзя, а сервер не хранит состояние сессий.
 * Формат подписи — HMAC-SHA256 в base64url; ровно то же самое умеет считать
 * `src/middleware.ts` через Web Crypto, поэтому проверка работает и на edge.
 */

export const SESSION_COOKIE = 'lr_admin'
export const SESSION_VERSION = 'v1'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Подпись завязана на пароль: смена `ADMIN_PASSWORD` разлогинивает всех. */
function sessionKey(): string {
  return `lead-router/admin-session/${env.ADMIN_PASSWORD}`
}

function sign(payload: string): string {
  return createHmac('sha256', sessionKey()).update(payload).digest('base64url')
}

/** Сравнение постоянного времени: длины строк выравнивает хеш. */
function constantTimeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

export function issueToken(now: number = Date.now()): string {
  const payload = `${SESSION_VERSION}.${now + SESSION_TTL_MS}`
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token: string | null | undefined, now: number = Date.now()): boolean {
  if (!token) return false

  const cut = token.lastIndexOf('.')
  if (cut <= 0) return false

  const payload = token.slice(0, cut)
  const signature = token.slice(cut + 1)
  if (!payload.startsWith(`${SESSION_VERSION}.`)) return false
  if (!constantTimeEqual(signature, sign(payload))) return false

  const expiresAt = Number(payload.slice(SESSION_VERSION.length + 1))
  return Number.isFinite(expiresAt) && expiresAt > now
}

export function checkPassword(input: string): boolean {
  return constantTimeEqual(input, env.ADMIN_PASSWORD)
}

export async function startSession(): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProd,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies()
  return verifyToken(jar.get(SESSION_COOKIE)?.value)
}

/**
 * Второй рубеж после middleware: страница не рендерится без валидной куки,
 * даже если её кто-то откроет в обход matcher'а.
 */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) redirect('/login')
}

/** Защита от open redirect: принимаем только относительные пути своего приложения. */
export function safeRedirectTarget(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}

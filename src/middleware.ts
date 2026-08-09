import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware крутится в edge-рантайме, где `node:crypto` недоступен, — подпись
 * проверяется через Web Crypto. Формат и секрет те же, что в `src/lib/auth.ts`
 * (HMAC-SHA256, base64url), так что кука, выданная логином, здесь валидна.
 *
 * Это первый рубеж: он отсекает анонимные запросы до рендера. Второй —
 * `requireAuth()` внутри самих страниц.
 */

const SESSION_COOKIE = 'lr_admin'
const SESSION_VERSION = 'v1'

const encoder = new TextEncoder()

function base64url(signature: ArrayBuffer): string {
  const bytes = new Uint8Array(signature)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function verifyToken(token: string, secret: string, now: number): Promise<boolean> {
  const cut = token.lastIndexOf('.')
  if (cut <= 0) return false

  const payload = token.slice(0, cut)
  const signature = token.slice(cut + 1)
  if (!payload.startsWith(`${SESSION_VERSION}.`)) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`lead-router/admin-session/${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  if (base64url(mac) !== signature) return false

  const expiresAt = Number(payload.slice(SESSION_VERSION.length + 1))
  return Number.isFinite(expiresAt) && expiresAt > now
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (secret && token && (await verifyToken(token, secret, Date.now()))) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''

  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`
  if (from !== '/' && request.method === 'GET') url.searchParams.set('from', from)

  const response = NextResponse.redirect(url)
  // Протухшую или подделанную куку сразу убираем, чтобы не возить её по кругу.
  if (token) response.cookies.delete(SESSION_COOKIE)
  return response
}

/**
 * `api/telegram` и `api/cron` вынесены из-под куки сознательно: их зовут
 * Telegram и планировщик, а не браузер. У каждого своя проверка секрета
 * внутри роута — см. `src/app/api/telegram/webhook` и `src/app/api/cron/tick`.
 */
export const config = {
  matcher: [
    '/((?!login|api/telegram|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
}

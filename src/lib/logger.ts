/**
 * Логгер без зависимостей: одна строка JSON-подобного текста на событие.
 * Специально не тянет `config/env` — логгер должен работать и тогда, когда
 * валидация окружения ещё не прошла (или уже упала).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function resolveMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase()
  if (raw && raw in ORDER) return raw as LogLevel
  // В тестах интересны только реальные проблемы, иначе вывод тонет в шуме.
  return process.env.NODE_ENV === 'test' ? 'warn' : 'info'
}

const MIN = ORDER[resolveMinLevel()]

/**
 * Именно `object`, а не `Record<string, unknown>`: у интерфейсов вроде
 * `ExpireReport` нет индексной сигнатуры, и в Record они не подставляются.
 */
export type LogMeta = object

export interface Logger {
  debug(message: string, meta?: LogMeta): void
  info(message: string, meta?: LogMeta): void
  warn(message: string, meta?: LogMeta): void
  error(message: string, meta?: LogMeta): void
  child(scope: string): Logger
}

/** Ошибки в meta разворачиваем в текст — иначе JSON.stringify отдаёт `{}`. */
function normalize(meta: LogMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (value instanceof Error) {
      out[key] = value.message
      if (value.stack && ORDER.debug >= MIN) out[`${key}Stack`] = value.stack
    } else if (typeof value === 'bigint') {
      out[key] = value.toString()
    } else {
      out[key] = value
    }
  }
  return out
}

function emit(level: LogLevel, scope: string, message: string, meta?: LogMeta): void {
  if (ORDER[level] < MIN) return
  const time = new Date().toISOString()
  const tail = meta && Object.keys(meta).length ? ` ${JSON.stringify(normalize(meta))}` : ''
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${tail}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, meta) => emit('debug', scope, m, meta),
    info: (m, meta) => emit('info', scope, m, meta),
    warn: (m, meta) => emit('warn', scope, m, meta),
    error: (m, meta) => emit('error', scope, m, meta),
    child: (sub) => createLogger(`${scope}:${sub}`),
  }
}

export const logger = createLogger('app')

/**
 * `BigInt` из Prisma (`tgUserId`, `contactTgId`, `chatId`) не переживает границу
 * server → client: React сериализует пропсы, а `JSON.stringify` на BigInt кидает
 * `TypeError: Do not know how to serialize a BigInt`. Поэтому всё, что уезжает в
 * клиентский компонент, в JSON или в выгрузку, проходит через эти хелперы.
 */

export type Serialized<T> = T extends bigint
  ? string
  : T extends Date
    ? Date
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T

export function bigintToString(value: bigint): string
export function bigintToString(value: bigint | null | undefined): string | null
export function bigintToString(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString()
}

function walk(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map(walk)

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) out[key] = walk(item)
  return out
}

/** Рекурсивно заменяет `BigInt` на строку. `Date` остаётся `Date` — его React умеет. */
export function serialize<T>(value: T): Serialized<T> {
  return walk(value) as Serialized<T>
}

/** Для `JSON.stringify(value, jsonReplacer)`, когда структура заранее не известна. */
export function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}

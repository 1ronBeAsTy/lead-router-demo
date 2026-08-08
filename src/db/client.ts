import { PrismaClient } from '@prisma/client'
import { isProd } from '../config/env'

/**
 * Один клиент на процесс. В dev Next.js перезагружает модули на каждом
 * изменении — без globalThis это кончается сотней открытых пулов.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error'] : ['error', 'warn'],
  })

if (!isProd) globalForPrisma.prisma = prisma

export type { Prisma } from '@prisma/client'

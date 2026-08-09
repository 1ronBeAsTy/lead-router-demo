import { spawnSync } from 'node:child_process'
import { PROJECT_ROOT, TEST_DATABASE_URL } from './env'

/**
 * Один раз на прогон: раскатать схему на тестовую базу.
 * `db push` создаёт саму базу, если её ещё нет, поэтому поднимать
 * `lead_router_test` руками не нужно — достаточно живого Postgres на 5433.
 */
export default async function setup(): Promise<void> {
  const result = spawnSync(
    'npx',
    ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      shell: true,
      encoding: 'utf8',
    },
  )

  if (result.status !== 0) {
    throw new Error(
      `prisma db push не отработал (код ${result.status}).\n` +
        `Проверьте, что Postgres поднят на порту 5433.\n` +
        `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    )
  }
}

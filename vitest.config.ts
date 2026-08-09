import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global.ts'],
    // Подменяет DATABASE_URL на тестовую базу ДО того, как тест импортирует
    // src/db/client.ts — иначе синглтон подключится к рабочей базе.
    setupFiles: ['tests/setup/env.ts'],
    // Интеграционные тесты делят одну базу и чистят её TRUNCATE — параллельно нельзя.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})

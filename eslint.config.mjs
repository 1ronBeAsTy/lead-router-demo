import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  {
    ignores: ['node_modules/**', '.next/**', 'dist/**', 'prisma/migrations/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Воркеры и сиды пишут в stdout осознанно.
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
]

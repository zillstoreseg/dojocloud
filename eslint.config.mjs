import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'src/generated/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Server actions legitimately take `unknown` shapes from FormData and
      // narrow them with Zod; the blanket ban gets in the way more than it helps.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tailwind's config is CommonJS-shaped by design.
    files: ['tailwind.config.ts', 'postcss.config.*'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];

export default config;

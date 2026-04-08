import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'android',
    'node_modules',
    'scripts/legacy',
    '.worktrees/**',
    'Moni-UI-Prototype/**',
    'pixel_bill_backend/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@app/*'], message: 'core 层不能依赖 app 层' },
          { group: ['@ui/*'], message: 'core 层不能依赖 ui 层' },
          { group: ['@system/*'], message: 'core 层不能依赖 system 层' },
          { group: ['@devtools/*'], message: 'core 层不能依赖 devtools 层' },
        ],
      }],
    },
  },
  {
    files: ['src/system/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@ui/*'], message: 'system 层不能依赖 ui 层' },
          { group: ['@app/*'], message: 'system 层不能依赖 app 层' },
          { group: ['@devtools/*'], message: 'system 层不能依赖 devtools 层' },
        ],
      }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@devtools/*'], message: 'ui 层不能依赖 devtools 层' },
        ],
      }],
    },
  },
])

// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Shared rule relaxations for all test files (vitest unit tests + Playwright E2E)
const testRuleOverrides = /** @type {const} */ ({
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-floating-promises': 'off',
  '@typescript-eslint/require-await': 'off',
  '@typescript-eslint/unbound-method': 'off',
  '@typescript-eslint/no-unnecessary-type-assertion': 'off',
  '@typescript-eslint/consistent-type-assertions': 'off',
  '@typescript-eslint/no-misused-promises': 'off',
})

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/routeTree.gen.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Allow root-level config files not included in tsconfig.app.json
          allowDefaultProject: ['*.config.js', 'vitest.config.ts', 'playwright.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript strict — align with project-wide no-any policy
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', {
        assertionStyle: 'as',
        objectLiteralTypeAssertions: 'never',
      }],

      // Prevent bare `as T` without runtime check (project CLAUDE.md rule)
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
    },
  },
  {
    // React Hooks plugin — flat config format
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // React Refresh plugin — Vite HMR compatibility
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
      }],
    },
  },
  {
    // Build/tool config files at the project root use untyped third-party plugins
    // and are not part of the application type graph — relax unsafe-* rules
    files: ['*.config.js', '*.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // AuthProvider exports both context and component (intentional design)
    // Shadcn/ui button.tsx exports both cva variants and Button component
    files: ['src/auth/AuthProvider.tsx', 'src/components/ui/button.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // TanStack Router route files use patterns ESLint doesn't know about:
    // - `throw redirect(...)` throws a non-Error (router-specific redirect object)
    // - Route files export both `Route` and function components by design
    files: ['src/routes/**/*.tsx'],
    rules: {
      '@typescript-eslint/only-throw-error': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Relaxed rules for all test files and test helpers
    // (vitest unit/integration, shared test helpers, Playwright E2E)
    files: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/__tests__/*-helpers.ts',
      'src/**/__tests__/*-helpers.tsx',
      'e2e/**/*.ts',
    ],
    rules: {
      ...testRuleOverrides,
      'react-refresh/only-export-components': 'off',
    },
  },
)

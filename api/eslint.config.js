// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import jsdoc from 'eslint-plugin-jsdoc'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  jsdoc.configs['flat/recommended-typescript'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // JSDoc — require on exported functions, not on everything
      'jsdoc/require-jsdoc': ['warn', {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
      }],
      'jsdoc/require-description': ['warn', {
        contexts: ['FunctionDeclaration', 'MethodDefinition'],
      }],
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/check-param-names': ['warn', { checkDestructured: false }],
      'jsdoc/require-param': ['warn', { checkDestructured: false }],
      'jsdoc/tag-lines': ['warn', 'any', { startLines: 1 }],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
    },
  },
)

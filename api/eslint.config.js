// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import prettierConfig from 'eslint-config-prettier';

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
        projectService: {
          allowDefaultProject: ['src/db/seed-io.test.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],

      // Prevent void on non-Promise return values (e.g. void reply.setCookie())
      'no-void': ['error', { allowAsStatement: false }],

      // Database safety — explicit column lists required
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/SELECT \\*/]',
          message:
            'Use explicit column lists instead of SELECT *. This prevents future columns from leaking into typed structs.',
        },
        {
          selector: 'Literal[value=/RETURNING \\*/]',
          message:
            'Use explicit column lists instead of RETURNING *. This prevents future columns from leaking into typed structs.',
        },
        {
          selector: 'TemplateLiteral:has(TemplateElement[value.raw=/SELECT \\*/])',
          message: 'Use explicit column lists instead of SELECT *.',
        },
        {
          selector: 'TemplateLiteral:has(TemplateElement[value.raw=/RETURNING \\*/])',
          message: 'Use explicit column lists instead of RETURNING *.',
        },
      ],

      // JSDoc — require on exported functions, not on everything
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
      'jsdoc/require-description': [
        'warn',
        {
          contexts: ['FunctionDeclaration', 'MethodDefinition'],
        },
      ],
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
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-assertions': 'off',
      'no-void': 'off',
      'no-restricted-syntax': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
    },
  },
  prettierConfig
);

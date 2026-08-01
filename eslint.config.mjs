import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import noOnlyTests from 'eslint-plugin-no-only-tests'

const eslintConfig = defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    // Generado por la CLI de Supabase.
    'src/lib/supabase/database.types.ts',
    // El stack local escribe código de sus contenedores aquí. No es nuestro.
    'supabase/.temp/**',
  ]),

  ...nextVitals,
  ...nextTs,

  {
    plugins: { 'no-only-tests': noOnlyTests },
    rules: {
      'no-only-tests/no-only-tests': 'error',

      /* --- Correctness --- */
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',

      /* --- Security --- */
      // eval and friends
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      // XSS surface: every dangerouslySetInnerHTML must be justified in review
      'react/no-danger': 'error',
      // target=_blank without rel=noopener leaks window.opener
      'react/jsx-no-target-blank': ['error', { allowReferrer: false }],

      /* --- Typescript hygiene --- */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',

      /* --- Architecture boundaries --- */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../*'],
              message: 'Deep relative imports are hard to move. Use the "@/" alias.',
            },
          ],
          paths: [
            {
              name: 'process',
              importNames: ['env'],
              message: 'Read config through @/lib/env, which validates it with Zod.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Never read process.env directly. Import the validated config from @/lib/env instead.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Bare new Date() makes rendering non-deterministic and untestable. Pass the clock in, or use @/lib/time.',
        },
      ],
    },
  },

  /* The service_role client bypasses every RLS policy. It has no business in
     a route that answers a user request. Jobs live under src/app/api/jobs/
     and are exempted below. */
  {
    files: ['src/app/**/*.{ts,tsx}'],
    ignores: ['src/app/api/jobs/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../*'],
              message: 'Deep relative imports are hard to move. Use the "@/" alias.',
            },
          ],
          paths: [
            {
              name: 'process',
              importNames: ['env'],
              message: 'Read config through @/lib/env, which validates it with Zod.',
            },
            {
              name: '@/lib/supabase/admin',
              message:
                'El cliente service_role salta TODO el RLS. En una ruta que responde a un ' +
                'usuario, usa @/lib/supabase/server y deja que la base decida qué puede ver.',
            },
          ],
        },
      ],
    },
  },

  /* env.ts is the ONE place allowed to touch process.env. */
  {
    files: ['src/lib/env.ts', 'src/lib/time.ts'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  /* Config files and tests run in Node and may read the environment freely. */
  {
    files: [
      '*.config.{ts,mts,js,mjs}',
      'scripts/**/*.{ts,mts,js,mjs}',
      'e2e/**/*.ts',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
    ],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },

  prettier,
])

export default eslintConfig

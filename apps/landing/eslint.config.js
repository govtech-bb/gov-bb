//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...tanstackConfig,
  // React Hooks lint: rules-of-hooks (error) + exhaustive-deps (warn). Only
  // these two — react-hooks@7's `recommended` preset also enables the broader
  // React-Compiler rules, out of scope for #1976.
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/naming-convention': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // .amplify-hosting is generated deploy output, not source — don't lint it.
    ignores: ['eslint.config.js', 'prettier.config.js', '.amplify-hosting/**'],
  },
]

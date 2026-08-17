import expoConfig from 'eslint-config-expo/flat.js';
import prettierConfig from 'eslint-config-prettier/flat';

export default [
  {
    ignores: [
      '**/.expo/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  ...expoConfig,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-redeclare': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: [
      'apps/example/App.tsx',
      'packages/wirokit/scripts/verify-exports.mjs',
      'packages/wirokit/test-d/exports.ts',
    ],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  prettierConfig,
];

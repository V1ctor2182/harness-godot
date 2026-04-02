import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript rules - relaxed for scaffold phase
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'off',

      // General rules
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['packages/web/**/*.tsx', 'packages/tui/**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // Test files - more lenient
    files: ['**/*.test.ts', '**/*.test.tsx', '__tests__/**/*'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // React entry points - standard boilerplate
    files: ['**/main.tsx', '**/main.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/dist/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
      '**/__tests__/**',
      // Game harness subdirectory has its own ESLint config and tsconfig setup;
      // exclude it from the root Inxtone ESLint project to avoid type-checking errors.
      'godot-self-evolve-implementation-system/**',
    ],
  }
);

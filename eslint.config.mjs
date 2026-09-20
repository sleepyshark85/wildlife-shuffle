// AC-1307: a lint step that runs clean, with no unused variables and no
// unreachable code. The react-hooks plugin is here for AC-215 specifically —
// v1 shipped a conditional hook (GamePreview.js:7-9) that nothing caught.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // docs/ holds the designer's artifacts, not source. They are linted by
  // reading, not by this step. (docs/v2/layout-sweep.mjs currently has one
  // unused variable, `unsup` at :64 — reported, not edited: it is AC-119's
  // reference implementation and not mine to change.)
  { ignores: ['node_modules/**', 'dist/**', '.expo/**', 'docs/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, __DEV__: 'readonly' },
    },
    settings: { react: { version: '19.0' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',     // AC-215
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error', // AC-1301
      'no-unreachable': 'error',
    },
  },
  {
    // Test files and the offline tools are allowed to talk to the terminal.
    files: ['test/**/*.js', 'tools/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
];

// Flat ESLint config for gts 7 (ESLint 9 + typescript-eslint 8).
// This project is an ES module ("type": "module"), so the config uses the
// .cjs extension to keep gts's CommonJS `require('gts')` export working.
const gts = require('gts');

module.exports = [
  {ignores: ['dist/', 'build/', 'coverage/']},
  ...gts,
  // gts pins type-aware linting to `project: './tsconfig.json'`, whose `include`
  // is scoped to `src` so the production build stays focused. Point the linter at
  // a wider tsconfig instead, so root build-tool configs (vite.config.ts) are
  // also type-checked while linting.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  // src/lib is the domain-agnostic substrate: pure plane geometry and shared
  // guards, dependency-free of the app layered above it. Enforce that leaf
  // status so it can't quietly grow an import back into the track domain or the
  // Paper.js/DOM edges.
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domain/**', '**/render/**', '**/editor/**', '**/main'],
              message:
                'src/lib is the domain-agnostic substrate; it must not import from domain, render, editor, or main.',
            },
          ],
        },
      ],
    },
  },
];

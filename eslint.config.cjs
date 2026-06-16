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
];

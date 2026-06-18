import {defineConfig} from 'vitest/config';

// GitHub Pages serves this project at https://<user>.github.io/empire-builder/,
// so production assets must be referenced under that sub-path. The dev server
// (and the test runner) stay at the root.
export default defineConfig(({command}) => ({
  base: command === 'build' ? '/empire-builder/' : '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));

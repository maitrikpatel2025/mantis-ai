import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'api/**/*.ts'],
      exclude: ['lib/chat/components/**', 'lib/types.ts'],
    },
    // Isolate tests to prevent shared state leaks
    pool: 'forks',
  },
});

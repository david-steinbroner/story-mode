import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    // Client tests can be added later with a separate jsdom-environment include.
    testTimeout: 10_000,
    // Until Chunk 2 adds real tests, an empty run shouldn't tank CI / pre-push.
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      // Mirror tsconfig.json paths so test imports work the same as runtime.
      // Only `@shared` is in tsconfig today; add more as tsconfig grows.
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});

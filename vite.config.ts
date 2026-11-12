import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  define: { __PORTABLE__: JSON.stringify(mode === 'portable') },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));

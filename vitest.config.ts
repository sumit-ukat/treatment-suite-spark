import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Explicit config so Vitest does not walk up and inherit the parent repository's
// TanStack Start vite config. This project is deliberately self-contained.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});

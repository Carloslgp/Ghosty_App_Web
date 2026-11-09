import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'notes/App': fileURLToPath(new URL('./test/stubs/remote.tsx', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['apps/*/src/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/main.tsx',
        '**/bootstrap.tsx',
        'packages/api-client/src/schema.d.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
});

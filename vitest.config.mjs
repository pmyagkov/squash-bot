import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/integration/config/setup.ts'],
    include: ['tests/integration/**/*.{test,spec}.{js,ts}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@e2e': path.resolve(__dirname, './tests/e2e'),
      '@integration': path.resolve(__dirname, './tests/integration'),
      '@test-utils': path.resolve(__dirname, './tests/shared'),
    },
  },
})

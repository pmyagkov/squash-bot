import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/integration/config/setup.ts', './tests/integration/vitest.setup.ts'],
    include: ['tests/integration/**/*.{test,spec}.{js,ts}', 'src/**/*.test.{js,ts}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts',
        'src/config/**',
        'src/**/__mocks__/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        'src/storage/repo/**': {
          statements: 91,
          branches: 83,
          functions: 90,
          lines: 90,
        },
        'src/helpers/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/utils/**': {
          statements: 94,
          branches: 85,
          functions: 87,
          lines: 94,
        },
        'src/services/formatters/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/services/transport/**': {
          statements: 26,
          branches: 21,
          functions: 25,
          lines: 26,
        },
        'src/services/logger/**': {
          statements: 68,
          branches: 58,
          functions: 100,
          lines: 68,
        },
        'src/business/**': {
          statements: 36,
          branches: 27,
          functions: 36,
          lines: 36,
        },
      },
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@e2e': path.resolve(__dirname, './tests/e2e'),
      '@integration': path.resolve(__dirname, './tests/integration'),
      '@test-utils': path.resolve(__dirname, './tests/shared'),
      '@mocks': path.resolve(__dirname, './tests/mocks'),
      '@fixtures': path.resolve(__dirname, './tests/fixtures'),
      '@tests/setup': path.resolve(__dirname, './tests/setup'),
    },
  },
})

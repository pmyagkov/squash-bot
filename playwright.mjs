import { defineConfig } from '@playwright/test'
import process from 'process'
import dotenv from 'dotenv'

// Load .env.test to read TELEGRAM_TEST_SERVER before config is evaluated
dotenv.config({ path: '.env.test' })

const authFile = '.auth/telegram-auth.json'
const useTestServer = process.env.TELEGRAM_TEST_SERVER === 'true'
const telegramBaseURL = useTestServer
  ? 'https://webk.telegram.org/?test=1'
  : 'https://web.telegram.org/k/'

export default defineConfig({
  testDir: './tests/e2e/specs',

  // Global setup to load .env.test
  globalSetup: './tests/e2e/config/global-setup.ts',

  // Test files pattern - only .spec.ts files
  testMatch: /.*\.spec\.ts/,

  // Run tests in files in parallel
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: 1,

  // Reporter to use
  reporter: [['dot']],

  // Shared settings for all the projects below
  use: {
    // Direct link to Telegram Web (test or production)
    baseURL: telegramBaseURL,

    // Mobile viewport (iPhone 14 Pro Max)
    viewport: { width: 430, height: 932 },

    // Device scale factor for retina displays
    deviceScaleFactor: 3,

    // Mobile user agent
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Use saved authentication state
    storageState: authFile,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: {
        // Run with visible browser when E2E_HEADED is set
        headless: !process.env.E2E_HEADED,
        // Slow down operations for better visibility when running headed
        slowMo: process.env.E2E_HEADED ? 500 : 0,
      },
    },
  ],

  // Run your local dev server before starting the tests
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
})

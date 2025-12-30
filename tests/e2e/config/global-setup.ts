import * as dotenv from 'dotenv'
import * as path from 'path'

/**
 * Global setup for Playwright E2E tests
 * Loads .env.test file before running tests
 */
async function globalSetup() {
  const rootDir = path.resolve(__dirname, '../..')
  const environment = process.env.ENVIRONMENT || 'test'

  // Load environment-specific file
  const envFile = environment === 'test' ? '.env.test' : '.env.prod'
  const envPath = path.join(rootDir, envFile)

  console.log(`[E2E Setup] Loading environment from: ${envFile}`)
  dotenv.config({ path: envPath, override: false })

  // Verify required variables
  const requiredVars = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_MAIN_CHAT_ID',
    'NOTION_API_KEY',
    'NOTION_DATABASE_SCAFFOLDS',
  ]

  const missing = requiredVars.filter((varName) => !process.env[varName])
  if (missing.length > 0) {
    console.warn(
      `[E2E Setup] Warning: Missing environment variables: ${missing.join(', ')}`
    )
  }

  console.log(`[E2E Setup] Environment loaded successfully`)
  console.log(`[E2E Setup] Test Chat ID: ${process.env.TELEGRAM_MAIN_CHAT_ID || 'not set'}`)
}

export default globalSetup

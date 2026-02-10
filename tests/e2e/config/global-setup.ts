import * as dotenv from 'dotenv'
import * as path from 'path'

/**
 * Global setup for Playwright E2E tests
 * Loads .env.test file. Database migrations and seed are handled by db-init service in docker-compose.
 */
async function globalSetup() {
  const rootDir = path.resolve(__dirname, '../../..')
  const environment = process.env.ENVIRONMENT || 'test'

  // Load environment-specific file
  const envFile = environment === 'test' ? '.env.test' : '.env.prod'
  const envPath = path.join(rootDir, envFile)

  console.log(`[E2E Setup] Loading environment from: ${envFile}`)
  dotenv.config({ path: envPath, override: false })

  // Verify required variables
  const requiredVars = ['TELEGRAM_BOT_TOKEN', 'DATABASE_URL']

  const missing = requiredVars.filter((varName) => !process.env[varName])
  if (missing.length > 0) {
    console.warn(`[E2E Setup] Warning: Missing environment variables: ${missing.join(', ')}`)
  }

  const useTestServer = process.env.TELEGRAM_TEST_SERVER === 'true'
  console.log(`[E2E Setup] Environment loaded successfully`)
  console.log(`[E2E Setup] Telegram server: ${useTestServer ? 'TEST' : 'PRODUCTION'}`)
  console.log(`[E2E Setup] Test Chat ID: -5009884489 (hardcoded from seed)`)
}

export default globalSetup

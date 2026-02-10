import * as dotenv from 'dotenv'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Global setup for Playwright E2E tests
 * Loads .env.test file and runs PostgreSQL migrations before tests
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
  const requiredVars = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_MAIN_CHAT_ID', 'DATABASE_URL']

  const missing = requiredVars.filter((varName) => !process.env[varName])
  if (missing.length > 0) {
    console.warn(`[E2E Setup] Warning: Missing environment variables: ${missing.join(', ')}`)
  }

  const useTestServer = process.env.TELEGRAM_TEST_SERVER === 'true'
  console.log(`[E2E Setup] Environment loaded successfully`)
  console.log(`[E2E Setup] Telegram server: ${useTestServer ? 'TEST' : 'PRODUCTION'}`)
  console.log(`[E2E Setup] Test Chat ID: ${process.env.TELEGRAM_MAIN_CHAT_ID || 'not set'}`)

  // Run database migrations for E2E tests
  if (process.env.DATABASE_URL) {
    console.log(`[E2E Setup] Running database migrations...`)
    try {
      const { stdout, stderr } = await execAsync('npx drizzle-kit push', {
        cwd: rootDir,
        env: { ...process.env },
      })
      if (stdout) console.log(stdout)
      if (stderr) console.error(stderr)
      console.log(`[E2E Setup] Database migrations completed successfully`)
    } catch (error) {
      console.error(`[E2E Setup] Failed to run migrations:`, error)
      throw error
    }
  }
}

export default globalSetup

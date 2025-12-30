import dotenv from 'dotenv'
import path from 'path'
import { reloadConfig } from '~/config'

// Get path to project root
// In tests __dirname may be undefined, use process.cwd()
const rootDir = path.resolve(process.cwd())

// Load environment variables for tests
// Set ENVIRONMENT=test before loading config
process.env.ENVIRONMENT = 'test'
// Load .env.test file for tests
dotenv.config({ path: path.join(rootDir, '.env.test') })

// Also load from current directory (in case we run from another folder)
dotenv.config()

// Set ADMIN_TELEGRAM_ID if not set (for tests)
if (!process.env.ADMIN_TELEGRAM_ID) {
  process.env.ADMIN_TELEGRAM_ID = '123456789'
}

// Reload config after loading environment variables
// This is needed because config may be imported before setup.ts is executed
reloadConfig()

// Check that key variables are loaded
// (warnings removed for clean test output)

import { vi, beforeEach } from 'vitest'
import dotenv from 'dotenv'
import path from 'path'
import { reloadConfig } from '~/config'
import { getTestDb, clearTestDb, seedTestSettings } from './database'

// ============================================================================
// Environment and Config Setup
// ============================================================================

// Get path to project root
const rootDir = path.resolve(process.cwd())

// Load environment variables for tests
// Set ENVIRONMENT=test before loading config
process.env.ENVIRONMENT = 'test'
// Load .env.test file for tests
dotenv.config({ path: path.join(rootDir, '.env.test') })

// Also load from current directory (in case we run from another folder)
dotenv.config()

// Reload config after loading environment variables
// This is needed because config may be imported before setup.ts is executed
reloadConfig()

// ============================================================================
// Database Setup
// ============================================================================

// Mock the db instance to use SQLite in-memory for all tests
vi.mock('~/storage/db', () => ({
  db: getTestDb(),
}))

// Clear database and seed essential settings before each test
beforeEach(async () => {
  await clearTestDb()
  await seedTestSettings()
})

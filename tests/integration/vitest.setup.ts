import { vi, beforeEach } from 'vitest'
import { getTestDb, clearTestDb } from './setup'

// Mock the db instance to use SQLite in-memory for all tests
vi.mock('~/storage/db', () => ({
  db: getTestDb(),
}))

// Clear database before each test to ensure isolation
beforeEach(async () => {
  await clearTestDb()
})

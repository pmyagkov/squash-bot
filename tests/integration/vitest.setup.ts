import { vi } from 'vitest'
import { getTestDb } from './setup'

// Mock the db instance to use SQLite in-memory for all tests
vi.mock('~/storage/db', () => ({
  db: getTestDb(),
}))

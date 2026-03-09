import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  readJournal,
  createTestDatabase,
  runTestJournal,
  runProductionMigrations,
  restoreProdDump,
  getNewMigrations,
  getTableColumns,
  hasMigrationFile,
  executeMigrationSql,
} from './helpers'
import type postgres from 'postgres'

const DATABASE_URL = process.env.MIGRATION_TEST_DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('MIGRATION_TEST_DATABASE_URL is not set. Run via: npm run test:migration')
}

describe('migration testing', () => {
  // ── 1. Journal validator ──────────────────────────────────────────────

  describe('journal validator', () => {
    it('test journal includes all production migrations in order', () => {
      const prod = readJournal('_journal.json')
      const test = readJournal('_test_journal.json')

      const prodTags = prod.entries.map((e) => e.tag)
      const testTags = test.entries.map((e) => e.tag)

      for (const tag of prodTags) {
        expect(testTags, `Missing migration "${tag}" in test journal`).toContain(tag)
      }

      // Verify production migrations appear in the same relative order in the test journal
      let lastIndex = -1
      for (const tag of prodTags) {
        const index = testTags.indexOf(tag)
        expect(index, `"${tag}" appears before previous production migration in test journal`).toBeGreaterThan(lastIndex)
        lastIndex = index
      }
    })
  })

  // ── 2. Smoke test ─────────────────────────────────────────────────────

  describe('smoke test', () => {
    let db: postgres.Sql
    let cleanup: () => Promise<void>

    beforeAll(async () => {
      const result = await createTestDatabase(DATABASE_URL!)
      db = result.db
      cleanup = result.cleanup
      await runProductionMigrations(result.url)
    }, 30000)

    afterAll(async () => {
      await cleanup()
    })

    it('all migrations apply and create expected tables', async () => {
      const tables = await db`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `
      const tableNames = tables.map((t) => t.table_name)

      expect(tableNames).toContain('scaffolds')
      expect(tableNames).toContain('events')
      expect(tableNames).toContain('participants')
      expect(tableNames).toContain('event_participants')
      expect(tableNames).toContain('payments')
      expect(tableNames).toContain('scaffold_participants')
      expect(tableNames).toContain('settings')
      expect(tableNames).toContain('notifications')
    })

    it('events table has expected columns', async () => {
      const columns = await getTableColumns(db, 'events')
      const colNames = columns.map((c) => c.column_name)

      expect(colNames).toContain('id')
      expect(colNames).toContain('scaffold_id')
      expect(colNames).toContain('datetime')
      expect(colNames).toContain('courts')
      expect(colNames).toContain('status')
      expect(colNames).toContain('owner_id')
      expect(colNames).toContain('deleted_at')
    })

    it('settings are seeded by 0001_initial_seed', async () => {
      const settings = await db`SELECT key, value FROM settings ORDER BY key`
      const keys = settings.map((s) => s.key)

      expect(keys).toContain('main_chat_id')
      expect(keys).toContain('admin_id')
      expect(keys).toContain('court_price')
      expect(keys).toContain('timezone')
      expect(keys).toContain('default_collector_id')
    })
  })

  // ── 3. Production dump test ───────────────────────────────────────────

  describe('production dump test', () => {
    let db: postgres.Sql
    let url: string
    let cleanup: () => Promise<void>
    let newMigrations: string[]

    beforeAll(async () => {
      const result = await createTestDatabase(DATABASE_URL!)
      db = result.db
      url = result.url
      cleanup = result.cleanup

      restoreProdDump(result.dbName)
      newMigrations = await getNewMigrations(db)

      if (newMigrations.length > 0) {
        await runProductionMigrations(url)
      }
    }, 60000)

    afterAll(async () => {
      await cleanup()
    })

    it('new migrations apply on production data without errors', () => {
      // If beforeAll succeeded, migrations applied without errors.
      // If there were no new migrations, this is a no-op (still valid).
      expect(true).toBe(true)
    })

    it('runs .expected.sql assertions for new migrations', async () => {
      for (const tag of newMigrations) {
        const expectedTag = `${tag}.expected`
        if (hasMigrationFile(expectedTag)) {
          await executeMigrationSql(db, expectedTag)
        }
      }
    })
  })

  // ── 4. Data tests (test journal) ──────────────────────────────────────

  describe('data tests (test journal)', () => {
    let db: postgres.Sql
    let cleanup: () => Promise<void>

    beforeAll(async () => {
      const result = await createTestDatabase(DATABASE_URL!)
      db = result.db
      cleanup = result.cleanup
    }, 30000)

    afterAll(async () => {
      await cleanup()
    })

    it('test journal executes without errors', async () => {
      await runTestJournal(db)
    })
  })
})

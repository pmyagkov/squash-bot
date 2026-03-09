import fs from 'fs'
import path from 'path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../src/storage/db/migrations')
const DUMP_FILE = path.resolve(__dirname, 'prod_dump.sql')

interface JournalEntry {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints?: boolean
}

interface Journal {
  version: string
  dialect: string
  entries: JournalEntry[]
}

/** Read a journal file from the migrations meta directory. */
export function readJournal(filename: string): Journal {
  const journalPath = path.join(MIGRATIONS_DIR, 'meta', filename)
  return JSON.parse(fs.readFileSync(journalPath, 'utf-8'))
}

/** Read a SQL file from the migrations directory. */
export function getMigrationSql(tag: string): string {
  const filePath = path.join(MIGRATIONS_DIR, `${tag}.sql`)
  return fs.readFileSync(filePath, 'utf-8')
}

/** Check if a SQL file exists in the migrations directory. */
export function hasMigrationFile(tag: string): boolean {
  return fs.existsSync(path.join(MIGRATIONS_DIR, `${tag}.sql`))
}

/** Read the production dump SQL file. */
export function getProdDumpSql(): string {
  return fs.readFileSync(DUMP_FILE, 'utf-8')
}

/**
 * Execute a SQL file against a postgres connection.
 * Splits by drizzle's `--> statement-breakpoint` delimiter.
 */
export async function executeMigrationSql(db: postgres.Sql, tag: string): Promise<void> {
  const sqlContent = getMigrationSql(tag)
  const statements = sqlContent
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await db.unsafe(statement)
  }
}

/**
 * Create a temporary database and return a connection, URL, and cleanup function.
 * Each test gets its own database — no cross-test interference.
 */
export async function createTestDatabase(baseUrl: string): Promise<{
  db: postgres.Sql
  url: string
  cleanup: () => Promise<void>
}> {
  const dbName = `migration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const adminDb = postgres(baseUrl, { max: 1 })
  await adminDb.unsafe(`CREATE DATABASE "${dbName}"`)
  await adminDb.end()

  const testUrl = baseUrl.replace(/\/[^/]+$/, `/${dbName}`)
  const db = postgres(testUrl, { max: 1 })

  const cleanup = async () => {
    await db.end()
    const adminDb2 = postgres(baseUrl, { max: 1 })
    await adminDb2.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
    await adminDb2.end()
  }

  return { db, url: testUrl, cleanup }
}

/** Run all entries from the test journal sequentially as plain SQL. */
export async function runTestJournal(db: postgres.Sql): Promise<void> {
  const journal = readJournal('_test_journal.json')
  for (const entry of journal.entries) {
    await executeMigrationSql(db, entry.tag)
  }
}

/** Run production migrations using drizzle migrator. */
export async function runProductionMigrations(connectionString: string): Promise<void> {
  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  await client.end()
}

/** Restore a production dump (plain SQL format) into a database. */
export async function restoreProdDump(db: postgres.Sql): Promise<void> {
  const dump = getProdDumpSql()
  await db.unsafe(dump)
}

/**
 * Get tags of migrations already applied (from __drizzle_migrations table in restored dump).
 * Returns empty array if the table doesn't exist.
 */
export async function getAppliedMigrations(db: postgres.Sql): Promise<string[]> {
  const rows = await db<Array<{ tag: string }>>`
    SELECT tag FROM __drizzle_migrations ORDER BY created_at
  `.catch(() => [])
  return rows.map((r) => r.tag)
}

/**
 * Determine which migrations are new: present in production journal but
 * not yet in __drizzle_migrations (i.e., not applied in the dump).
 */
export async function getNewMigrations(db: postgres.Sql): Promise<string[]> {
  const journal = readJournal('_journal.json')
  const applied = await getAppliedMigrations(db)
  return journal.entries.map((e) => e.tag).filter((tag) => !applied.includes(tag))
}

/** Query information_schema for table columns. */
export async function getTableColumns(
  db: postgres.Sql,
  tableName: string
): Promise<Array<{ column_name: string; data_type: string; is_nullable: string }>> {
  return db<Array<{ column_name: string; data_type: string; is_nullable: string }>>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `
}

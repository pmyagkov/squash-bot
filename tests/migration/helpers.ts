import { execSync } from 'child_process'
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
  dbName: string
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

  return { db, url: testUrl, dbName, cleanup }
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

/**
 * Restore a production dump into a database via psql in the Docker container.
 * Uses psql CLI because pg_dump output contains backslash meta-commands
 * that the postgres npm client cannot handle.
 */
export function restoreProdDump(dbName: string): void {
  const containerName = 'squash-bot-postgres-migration'
  execSync(`docker cp "${DUMP_FILE}" ${containerName}:/tmp/prod_dump.sql`)
  execSync(`docker exec ${containerName} psql -U postgres -d "${dbName}" -f /tmp/prod_dump.sql`, {
    stdio: 'pipe',
  })
}

/**
 * Get the created_at of the last applied migration from drizzle's tracking table.
 * Drizzle stores migrations in "drizzle"."__drizzle_migrations" with columns:
 *   id SERIAL, hash TEXT (sha256 of SQL), created_at NUMERIC (folderMillis from journal).
 * Returns -1 if the table doesn't exist (fresh database).
 */
async function getLastAppliedTimestamp(db: postgres.Sql): Promise<number> {
  const rows = await db<{ created_at: string }[]>`
    SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1
  `.catch(() => [])
  return rows.length > 0 ? Number(rows[0].created_at) : -1
}

/**
 * Determine which migrations are new: present in production journal but
 * not yet in __drizzle_migrations (i.e., not applied in the dump).
 * Compares journal entry timestamps against the last applied migration timestamp.
 */
export async function getNewMigrations(db: postgres.Sql): Promise<string[]> {
  const journal = readJournal('_journal.json')
  const lastApplied = await getLastAppliedTimestamp(db)
  return journal.entries.filter((e) => e.when > lastApplied).map((e) => e.tag)
}

/** Query information_schema for table columns. */
export async function getTableColumns(
  db: postgres.Sql,
  tableName: string
): Promise<{ column_name: string; data_type: string; is_nullable: string }[]> {
  return db<{ column_name: string; data_type: string; is_nullable: string }[]>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `
}

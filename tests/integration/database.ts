import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import * as schema from '~/storage/db/schema'
import { TEST_CONFIG } from '@fixtures/config'

let testDb: ReturnType<typeof drizzle> | null = null

export function getTestDb() {
  if (!testDb) {
    const sqlite = new Database(':memory:')
    // Configure SQLite to handle booleans as integers
    sqlite.pragma('journal_mode = WAL')
    testDb = drizzle(sqlite, { schema, logger: false })
    createTables(testDb)
  }
  return testDb
}

export async function clearTestDb() {
  const db = getTestDb()
  // Delete in FK order (children first)
  await db.delete(schema.payments)
  await db.delete(schema.eventParticipants)
  await db.delete(schema.events)
  await db.delete(schema.scaffolds)
  await db.delete(schema.participants)
  await db.delete(schema.settings)
}

/**
 * Seed essential settings that most tests need.
 * Called after clearTestDb() in vitest.setup.ts beforeEach.
 */
export async function seedTestSettings() {
  const db = getTestDb()
  await db.insert(schema.settings).values([
    { key: 'admin_id', value: String(TEST_CONFIG.adminId) },
    { key: 'main_chat_id', value: String(TEST_CONFIG.chatId) },
  ])
}

function createTables(db: ReturnType<typeof drizzle>) {
  // Create tables in SQLite
  // Note: SQLite doesn't support all PostgreSQL types, but Drizzle handles conversion

  db.run(sql`
    CREATE TABLE scaffolds (
      id TEXT PRIMARY KEY,
      day_of_week TEXT NOT NULL,
      time TEXT NOT NULL,
      default_courts INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      announcement_deadline TEXT,
      owner_id TEXT
    )
  `)

  db.run(sql`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      scaffold_id TEXT,
      datetime TEXT NOT NULL,
      courts INTEGER NOT NULL,
      status TEXT NOT NULL,
      telegram_message_id TEXT,
      payment_message_id TEXT,
      announcement_deadline TEXT,
      owner_id TEXT,
      FOREIGN KEY (scaffold_id) REFERENCES scaffolds(id)
    )
  `)

  db.run(sql`
    CREATE TABLE participants (
      id TEXT PRIMARY KEY,
      telegram_username TEXT,
      telegram_id TEXT,
      display_name TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE event_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      participations INTEGER DEFAULT 1 NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id),
      UNIQUE (event_id, participant_id)
    )
  `)

  db.run(sql`
    CREATE TABLE payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      is_paid INTEGER DEFAULT 0 NOT NULL,
      paid_at TEXT,
      reminder_count INTEGER DEFAULT 0 NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )
  `)

  db.run(sql`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
}

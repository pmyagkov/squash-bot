import { drizzle } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '~/config'
import * as schema from './schema'

// Determine database type based on DATABASE_URL
// If DATABASE_URL starts with postgres:// or postgresql://, use PostgreSQL
// Otherwise, use SQLite for local development (via better-sqlite3)
function createDatabase(): PostgresJsDatabase<typeof schema> {
  const databaseUrl = config.database.url
  const isPostgres =
    databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')

  if (isPostgres) {
    // PostgreSQL connection for production and e2e tests
    const client = postgres(databaseUrl)
    return drizzle(client, { schema })
  } else {
    // SQLite connection for local development
    // Import SQLite dependencies dynamically to avoid bundling them in production
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzleSqlite } = require('drizzle-orm/better-sqlite3')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')

    const sqliteUrl = databaseUrl || './local.db'
    const sqlite = new Database(sqliteUrl)
    sqlite.pragma('journal_mode = WAL')

    // Type assertion: SQLite and PostgreSQL drizzle instances are compatible
    // at runtime for most operations, and tests will mock this module anyway
    return drizzleSqlite(sqlite, { schema }) as PostgresJsDatabase<typeof schema>
  }
}

// Drizzle instance with schema
export const db = createDatabase()

// Type export for tests
export type Database = typeof db

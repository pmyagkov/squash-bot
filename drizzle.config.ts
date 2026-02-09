import type { Config } from 'drizzle-kit'

// Determine database type based on DATABASE_URL
// If DATABASE_URL starts with postgres:// or postgresql://, use PostgreSQL
// Otherwise, default to SQLite for local development
function getDatabaseConfig(): Config {
  const databaseUrl = process.env.DATABASE_URL || ''
  const isPostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')

  if (isPostgres) {
    // PostgreSQL configuration for production and e2e tests
    return {
      schema: './src/storage/db/schema.ts',
      out: './src/storage/db/migrations',
      dialect: 'postgresql',
      dbCredentials: {
        url: databaseUrl,
      },
    } satisfies Config
  } else {
    // SQLite configuration for local development and unit tests
    const sqliteUrl = databaseUrl || './local.db'
    return {
      schema: './src/storage/db/schema.ts',
      out: './src/storage/db/migrations',
      dialect: 'sqlite',
      dbCredentials: {
        url: sqliteUrl,
      },
    } satisfies Config
  }
}

export default getDatabaseConfig()

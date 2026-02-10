import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[Migrate] DATABASE_URL is not set')
  process.exit(1)
}

console.log('[Migrate] Running database migrations...')

const sql = postgres(databaseUrl, { max: 1 })
const db = drizzle(sql)

migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') })
  .then(() => {
    console.log('[Migrate] Done')
    return sql.end()
  })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[Migrate] Failed:', error)
    process.exit(1)
  })

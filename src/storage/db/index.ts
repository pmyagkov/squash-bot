import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '~/config'
import * as schema from './schema'

// Connection
const client = postgres(config.database.url)

// Drizzle instance with schema
export const db = drizzle(client, { schema })

// Type export for tests
export type Database = typeof db

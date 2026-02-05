import type { Config } from 'drizzle-kit'

export default {
  schema: './src/storage/db/schema.ts',
  out: './src/storage/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config

import { db } from '.'
import { settings } from './schema'

const SEEDS: Record<string, Record<string, string>> = {
  test: {
    main_chat_id: '-5009884489',
    admin_id: '2201118091',
  },
  production: {
    main_chat_id: 'REPLACE_WITH_PRODUCTION_CHAT_ID',
    admin_id: 'REPLACE_WITH_PRODUCTION_ADMIN_ID',
  },
}

async function seed() {
  const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'production'
  const env = environment === 'test' ? 'test' : 'production'
  const values = SEEDS[env]

  console.log(`[Seed] Seeding settings for '${env}' environment...`)

  for (const [key, value] of Object.entries(values)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing({ target: settings.key })

    console.log(`[Seed] ${key} = ${value} (insert if not exists)`)
  }

  console.log('[Seed] Done')
  process.exit(0)
}

seed().catch((error) => {
  console.error('[Seed] Failed:', error)
  process.exit(1)
})

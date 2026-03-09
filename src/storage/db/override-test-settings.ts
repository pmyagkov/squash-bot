import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[Settings] DATABASE_URL is not set')
  process.exit(1)
}

const sql = postgres(DATABASE_URL)

const overrides: Record<string, string> = {
  main_chat_id: '-5009884489',
  admin_id: '2201118091',
  default_collector_id: '2201118091',
}

async function overrideSettings() {
  for (const [key, value] of Object.entries(overrides)) {
    await sql`UPDATE settings SET value = ${value} WHERE key = ${key}`
    console.log(`[Settings] ${key} = ${value}`)
  }
  await sql.end()
  console.log('[Settings] Test settings applied')
}

overrideSettings().catch((error) => {
  console.error('[Settings] Failed:', error)
  process.exit(1)
})

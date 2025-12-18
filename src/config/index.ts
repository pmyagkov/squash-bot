import dotenv from 'dotenv'
import path from 'path'

// Function to load environment variables
function loadEnv() {
  const rootDir = path.resolve(__dirname, '../..')
  // First .env (main), then .env.test (overrides)
  dotenv.config({ path: path.join(rootDir, '.env'), override: false })
  dotenv.config({ path: path.join(rootDir, '.env.test'), override: false })
  // Also load from current directory (in case we run from another folder)
  dotenv.config({ override: false })
}

// Load environment variables when module is imported
loadEnv()

// Export function for reloading (for tests)
export function reloadConfig() {
  loadEnv()
}

// Create function to get config that always reads current values from process.env
function getConfig() {
  return {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      mainChatId: process.env.TELEGRAM_MAIN_CHAT_ID!,
      testChatId: process.env.TELEGRAM_TEST_CHAT_ID!,
      logChatId: process.env.TELEGRAM_LOG_CHAT_ID!,
      adminId: process.env.ADMIN_TELEGRAM_ID!,
    },
    notion: {
      apiKey: process.env.NOTION_API_KEY || '',
      databases: {
        scaffolds: process.env.NOTION_DATABASE_SCAFFOLDS!,
        events: process.env.NOTION_DATABASE_EVENTS!,
        participants: process.env.NOTION_DATABASE_PARTICIPANTS!,
        eventParticipants: process.env.NOTION_DATABASE_EVENT_PARTICIPANTS!,
        payments: process.env.NOTION_DATABASE_PAYMENTS!,
        settings: process.env.NOTION_DATABASE_SETTINGS!,
      },
      testDatabases: {
        scaffolds: process.env.NOTION_DATABASE_SCAFFOLDS_TEST!,
        events: process.env.NOTION_DATABASE_EVENTS_TEST!,
        participants: process.env.NOTION_DATABASE_PARTICIPANTS_TEST!,
        eventParticipants: process.env.NOTION_DATABASE_EVENT_PARTICIPANTS_TEST!,
        payments: process.env.NOTION_DATABASE_PAYMENTS_TEST!,
        settings: process.env.NOTION_DATABASE_SETTINGS_TEST!,
      },
    },
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      apiKey: process.env.API_KEY!,
    },
    timezone: process.env.TIMEZONE || 'Europe/Belgrade',
  }
}

// Export config as Proxy that always reads current values
export const config = new Proxy({} as ReturnType<typeof getConfig>, {
  get(_target, prop) {
    const currentConfig = getConfig()
    return (currentConfig as any)[prop]
  },
})

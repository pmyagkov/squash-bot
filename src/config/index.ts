import dotenv from 'dotenv'
import path from 'path'

// Get current environment (test or production)
// Must be called before loadEnv to determine which file to load
function getEnvironment(): 'test' | 'production' {
  const env = process.env.ENVIRONMENT || process.env.NODE_ENV || 'production'
  return env === 'test' ? 'test' : 'production'
}

// Function to load environment variables
function loadEnv() {
  const rootDir = path.resolve(__dirname, '../..')
  const environment = getEnvironment()

  // Load environment-specific file (.env.prod or .env.test)
  const envFile = environment === 'test' ? '.env.test' : '.env.prod'
  dotenv.config({ path: path.join(rootDir, envFile), override: false })

  // Also load from current directory (in case we run from another folder)
  dotenv.config({ override: false })

  console.log(`Environment variables loaded for '${environment}' environment from '${envFile}'`)
}

// Load environment variables when module is imported
loadEnv()

// Export function for reloading (for tests)
export function reloadConfig() {
  loadEnv()
}

// Create function to get config that always reads current values from process.env
function getConfig() {
  const environment = getEnvironment()

  return {
    environment,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      mainChatId: process.env.TELEGRAM_MAIN_CHAT_ID!,
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
    },
    server: {
      port: parseInt(process.env.PORT || '3010', 10),
      apiKey: process.env.API_KEY!,
    },
    timezone: process.env.TIMEZONE || 'Europe/Belgrade',
  }
}

// Export config as Proxy that always reads current values
type ConfigType = ReturnType<typeof getConfig>
export const config = new Proxy({} as ConfigType, {
  get(_target, prop: keyof ConfigType) {
    const currentConfig = getConfig()
    return currentConfig[prop]
  },
})

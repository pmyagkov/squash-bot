import dotenv from 'dotenv'
import path from 'path'

// Функция для загрузки переменных окружения
function loadEnv() {
  const rootDir = path.resolve(__dirname, '../..')
  // Сначала .env (основной), потом .env.test (переопределения)
  dotenv.config({ path: path.join(rootDir, '.env'), override: false })
  dotenv.config({ path: path.join(rootDir, '.env.test'), override: false })
  // Также загружаем из текущей директории (на случай если запускаем из другой папки)
  dotenv.config({ override: false })
}

// Загружаем переменные окружения при импорте модуля
loadEnv()

// Экспортируем функцию для перезагрузки (для тестов)
export function reloadConfig() {
  loadEnv()
}

// Создаем функцию для получения конфига, которая всегда читает актуальные значения из process.env
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

// Экспортируем config как Proxy, который всегда читает актуальные значения
export const config = new Proxy({} as ReturnType<typeof getConfig>, {
  get(_target, prop) {
    const currentConfig = getConfig()
    return (currentConfig as any)[prop]
  },
})

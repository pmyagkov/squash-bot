import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    mainChatId: process.env.TELEGRAM_MAIN_CHAT_ID!,
    testChatId: process.env.TELEGRAM_TEST_CHAT_ID!,
    logChatId: process.env.TELEGRAM_LOG_CHAT_ID!,
    adminId: process.env.ADMIN_TELEGRAM_ID!,
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY!,
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
};

import { config } from '../config'

export function isTestEnvironment(): boolean {
  return config.environment === 'test'
}

export function isTestChat(chatId: number | string): boolean {
  // Test commands are available when running in test environment
  // OR when the chat is the main configured chat
  return config.environment === 'test' || chatId.toString() === config.telegram.mainChatId
}

export function getDatabases() {
  // In test environment, always use databases from .env.test
  // In production, always use databases from .env.prod
  return config.notion.databases
}

export function isAdmin(userId: number | string): boolean {
  return userId.toString() === config.telegram.adminId
}

import { config } from '../config';

export function isTestChat(chatId: number | string): boolean {
  return chatId.toString() === config.telegram.testChatId;
}

export function getDatabases(chatId: number | string) {
  return isTestChat(chatId) ? config.notion.testDatabases : config.notion.databases;
}

export function isAdmin(userId: number | string): boolean {
  return userId.toString() === config.telegram.adminId;
}

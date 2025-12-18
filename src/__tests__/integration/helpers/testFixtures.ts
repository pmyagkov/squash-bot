import { config } from '~/config'

// Тестовые константы
// Используем реальный testChatId из конфига, чтобы isTestChat() работал правильно
export const TEST_CHAT_ID = Number(config.telegram.testChatId) || -1001234567890
export const ADMIN_ID = Number(config.telegram.adminId) || 123456789
export const NON_ADMIN_ID = 999999999




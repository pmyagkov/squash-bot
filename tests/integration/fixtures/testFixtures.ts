import { config } from '~/config'

// Test constants
// Use real mainChatId from config for tests
export const TEST_CHAT_ID = Number(config.telegram.mainChatId) || -1001234567890
export const ADMIN_ID = Number(config.telegram.adminId) || 123456789
export const NON_ADMIN_ID = 999999999

/**
 * Centralized test configuration
 * Used across all mocks and tests for consistency
 */
export const TEST_CONFIG = {
  // User IDs
  userId: 123456789,
  adminId: 111111111,

  // Chat IDs
  chatId: 987654321,
  privateChatId: 555555555,

  // Bot configuration
  botToken: 'test-bot-token',
  apiKey: 'test-api-key',

  // App settings
  timezone: 'Europe/Moscow',

  // Message IDs
  messageId: 1,

  // Callback query
  callbackQueryId: 'cb_test123',
} as const

/**
 * Test user data
 */
export const TEST_USER = {
  id: TEST_CONFIG.userId,
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
} as const

export const TEST_ADMIN = {
  id: TEST_CONFIG.adminId,
  firstName: 'Admin',
  lastName: 'User',
  username: 'adminuser',
} as const

/**
 * Test chat data
 */
export const TEST_CHAT = {
  id: TEST_CONFIG.chatId,
  type: 'group' as const,
  title: 'Test Squash Group',
}
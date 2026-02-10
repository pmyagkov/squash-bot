import { describe, it, expect } from 'vitest'
import { mockConfig } from './config'
import { TEST_CONFIG } from '@fixtures/config'

describe('mockConfig', () => {
  it('should create config with defaults from TEST_CONFIG', () => {
    const config = mockConfig()

    expect(config.telegram.botToken).toBe(TEST_CONFIG.botToken)
    expect(config.telegram.mainChatId).toBe(String(TEST_CONFIG.chatId))
    expect(config.timezone).toBe(TEST_CONFIG.timezone)
  })

  it('should allow overriding specific fields', () => {
    const config = mockConfig({
      telegram: {
        botToken: 'custom-token',
        mainChatId: String(TEST_CONFIG.chatId),
        logChatId: String(TEST_CONFIG.chatId),
        adminId: String(TEST_CONFIG.adminId),
        useTestServer: false,
      },
      timezone: 'UTC',
    })

    expect(config.telegram.botToken).toBe('custom-token')
    expect(config.timezone).toBe('UTC')
    expect(config.telegram.mainChatId).toBe(String(TEST_CONFIG.chatId)) // default preserved
  })
})

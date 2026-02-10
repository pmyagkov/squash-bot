import { describe, it, expect } from 'vitest'
import { mockConfig } from './config'
import { TEST_CONFIG } from '@fixtures/config'

describe('mockConfig', () => {
  it('should create config with defaults from TEST_CONFIG', () => {
    const config = mockConfig()

    expect(config.telegram.botToken).toBe(TEST_CONFIG.botToken)
    expect(config.timezone).toBe(TEST_CONFIG.timezone)
  })

  it('should allow overriding specific fields', () => {
    const config = mockConfig({
      telegram: {
        botToken: 'custom-token',
        logChatId: String(TEST_CONFIG.chatId),
        useTestServer: false,
      },
      timezone: 'UTC',
    })

    expect(config.telegram.botToken).toBe('custom-token')
    expect(config.timezone).toBe('UTC')
  })
})

import { describe, it, expect } from 'vitest'
import { mockConfig } from './config'
import { TEST_CONFIG } from '@fixtures/config'

describe('mockConfig', () => {
  it('should create config with defaults from TEST_CONFIG', () => {
    const config = mockConfig()

    expect(config.botToken).toBe(TEST_CONFIG.botToken)
    expect(config.chatId).toBe(String(TEST_CONFIG.chatId))
    expect(config.timezone).toBe(TEST_CONFIG.timezone)
  })

  it('should allow overriding specific fields', () => {
    const config = mockConfig({
      botToken: 'custom-token',
      timezone: 'UTC'
    })

    expect(config.botToken).toBe('custom-token')
    expect(config.timezone).toBe('UTC')
    expect(config.chatId).toBe(String(TEST_CONFIG.chatId)) // default preserved
  })
})

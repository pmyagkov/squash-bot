import { TEST_CONFIG } from '@fixtures/config'
import type { Config } from '~/config'

/**
 * Mock for Config
 * Provides reasonable defaults from TEST_CONFIG
 */
export function mockConfig(overrides?: Partial<Config>): Config {
  return {
    botToken: TEST_CONFIG.botToken,
    n8nApiKey: TEST_CONFIG.apiKey,
    chatId: String(TEST_CONFIG.chatId),
    timezone: TEST_CONFIG.timezone,
    databaseUrl: ':memory:',
    ...overrides,
  }
}

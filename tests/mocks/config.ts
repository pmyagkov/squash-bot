import { TEST_CONFIG } from '@fixtures/config'
import { config } from '~/config'

type ConfigType = typeof config

/**
 * Mock for Config
 * Provides reasonable defaults from TEST_CONFIG
 */
export function mockConfig(overrides?: Partial<ConfigType>): ConfigType {
  const baseConfig: ConfigType = {
    environment: 'test' as const,
    telegram: {
      botToken: TEST_CONFIG.botToken,
      mainChatId: String(TEST_CONFIG.chatId),
      logChatId: String(TEST_CONFIG.chatId),
      adminId: String(TEST_CONFIG.adminId),
      useTestServer: false,
    },
    database: {
      url: ':memory:',
    },
    server: {
      port: 3010,
      apiKey: TEST_CONFIG.apiKey,
    },
    timezone: TEST_CONFIG.timezone,
  }

  return {
    ...baseConfig,
    ...overrides,
  }
}

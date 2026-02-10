import * as fs from 'fs'
import * as path from 'path'

/**
 * Configuration for E2E tests
 */

// Path to the saved Playwright storage state
export const authFile = path.resolve(process.cwd(), '.auth', 'telegram-auth.json')
export const hasAuth = fs.existsSync(authFile)

// Telegram test server support
export const useTestServer = process.env.TELEGRAM_TEST_SERVER === 'true'

export function getTelegramWebUrl(chatId?: string): string {
  const base = useTestServer ? 'https://webk.telegram.org/' : 'https://web.telegram.org/k/'
  const query = useTestServer ? '?test=1' : ''
  const hash = chatId ? `#${chatId}` : ''
  return `${base}${query}${hash}`
}

/**
 * Timeouts (in milliseconds)
 */
export const TIMEOUTS = {
  // Default timeout for waiting for messages
  messageWait: 10000,

  // Timeout for page load
  pageLoad: 10000,

  // Timeout for bot response
  botResponse: 10000,

  // Timeout for announcement message
  announcement: 10000,

  // Timeout for payment message
  payment: 10000,
} as const

/**
 * Test data
 */
export const TEST_DATA = {
  // Default scaffold settings
  scaffold: {
    day: 'Tue',
    time: '21:00',
    courts: 2,
  },

  // Default event settings
  event: {
    time: '19:00',
    courts: 2,
  },
} as const

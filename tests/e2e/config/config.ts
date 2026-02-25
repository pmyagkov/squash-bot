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
 * CI environments are slower — multiply all timeouts by 5x
 */
const timeoutMultiplier = process.env.CI ? 5 : 1

export const TIMEOUTS = {
  pageLoad: 10000 * timeoutMultiplier,
  botResponse: 2000 * timeoutMultiplier,
  messageWait: 2000 * timeoutMultiplier,
  announcement: 2000 * timeoutMultiplier,
  announcementChange: 10000 * timeoutMultiplier,
  payment: 2000 * timeoutMultiplier,
  paymentUpdate: 2000 * timeoutMultiplier,
  inlineButton: 2000 * timeoutMultiplier,
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

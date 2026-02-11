import { test as base } from '@playwright/test'
import { ScaffoldCommands } from '@e2e/pages/commands/ScaffoldCommands'
import { EventCommands } from '@e2e/pages/commands/EventCommands'
import { ParticipantActions } from '@e2e/pages/actions/ParticipantActions'
import { PaymentActions } from '@e2e/pages/actions/PaymentActions'
import { ChatPage } from '@e2e/pages/ChatPage'

/**
 * Custom fixtures for E2E tests
 * Provides test data from .env.test and Page Objects
 */

type TestFixtures = {
  // Chat IDs
  groupChatId: string
  botChatId: string

  // Page Objects
  chatPage: ChatPage
  scaffoldCommands: ScaffoldCommands
  eventCommands: EventCommands
  participantActions: ParticipantActions
  paymentActions: PaymentActions
}

/**
 * Extract bot user ID from TELEGRAM_BOT_TOKEN (format: "123456:ABC-DEF")
 * In Telegram Web K, navigating to #<bot_user_id> opens the private chat with the bot
 */
function getBotChatId(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set. Required for E2E tests.')
  }
  return token.split(':')[0]
}

export const test = base.extend<TestFixtures>({
  /**
   * Group chat ID where announcements appear
   * This value matches the seed script in src/db-seed.ts
   */
  // eslint-disable-next-line no-empty-pattern
  groupChatId: async ({}, use) => {
    await use('-5009884489')
  },

  /**
   * Bot private chat ID (bot user ID extracted from token)
   * Commands are sent here in private chat with the bot
   */
  // eslint-disable-next-line no-empty-pattern
  botChatId: async ({}, use) => {
    await use(getBotChatId())
  },

  /**
   * ChatPage instance initialized with current page
   * Navigates to group chat by default
   */
  chatPage: async ({ page, groupChatId }, use) => {
    const chatPage = new ChatPage(page)
    await chatPage.navigateToChat(groupChatId)
    await use(chatPage)
  },

  /**
   * ScaffoldCommands instance initialized with current page
   * Navigates to private chat with bot (commands only work in DM)
   */
  scaffoldCommands: async ({ page, botChatId }, use) => {
    const scaffoldCommands = new ScaffoldCommands(page)
    await scaffoldCommands.navigateToChat(botChatId)
    await use(scaffoldCommands)
  },

  /**
   * EventCommands instance initialized with current page
   * Navigates to private chat with bot (commands only work in DM)
   */
  eventCommands: async ({ page, botChatId }, use) => {
    const eventCommands = new EventCommands(page)
    await eventCommands.navigateToChat(botChatId)
    await use(eventCommands)
  },

  /**
   * ParticipantActions instance initialized with current page
   * Page should already be on the group chat with event announcement
   */
  participantActions: async ({ page }, use) => {
    const participantActions = new ParticipantActions(page)
    await use(participantActions)
  },

  /**
   * PaymentActions instance initialized with current page
   * Page should already be on the group chat with payment message
   */
  paymentActions: async ({ page }, use) => {
    const paymentActions = new PaymentActions(page)
    await use(paymentActions)
  },
})

export { expect } from '@playwright/test'

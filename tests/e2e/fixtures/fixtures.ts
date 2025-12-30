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
  // Test data from .env.test
  chatId: string

  // Page Objects
  chatPage: ChatPage
  scaffoldCommands: ScaffoldCommands
  eventCommands: EventCommands
  participantActions: ParticipantActions
  paymentActions: PaymentActions
}

export const test = base.extend<TestFixtures>({
  /**
   * Chat ID from .env.test (TELEGRAM_MAIN_CHAT_ID)
   * This is the test chat where bot commands will be sent
   */
  chatId: async ({}, use) => {
    const chatId = process.env.TELEGRAM_MAIN_CHAT_ID
    if (!chatId) {
      throw new Error(
        'TELEGRAM_MAIN_CHAT_ID is not set. Make sure .env.test is loaded via global-setup.ts'
      )
    }
    await use(chatId)
  },

  /**
   * ChatPage instance initialized with current page
   * Automatically navigates to test chat
   */
  chatPage: async ({ page, chatId }, use) => {
    const chatPage = new ChatPage(page)
    await chatPage.navigateToChat(chatId)
    await use(chatPage)
  },

  /**
   * ScaffoldCommands instance initialized with current page
   * Automatically navigates to test chat
   */
  scaffoldCommands: async ({ page, chatId }, use) => {
    const scaffoldCommands = new ScaffoldCommands(page)
    await scaffoldCommands.navigateToChat(chatId)
    await use(scaffoldCommands)
  },

  /**
   * EventCommands instance initialized with current page
   * Automatically navigates to test chat
   */
  eventCommands: async ({ page, chatId }, use) => {
    const eventCommands = new EventCommands(page)
    await eventCommands.navigateToChat(chatId)
    await use(eventCommands)
  },

  /**
   * ParticipantActions instance initialized with current page
   * Page should already be on the chat with event announcement
   */
  participantActions: async ({ page }, use) => {
    const participantActions = new ParticipantActions(page)
    await use(participantActions)
  },

  /**
   * PaymentActions instance initialized with current page
   * Page should already be on the chat with payment message
   */
  paymentActions: async ({ page }, use) => {
    const paymentActions = new PaymentActions(page)
    await use(paymentActions)
  },
})

export { expect } from '@playwright/test'

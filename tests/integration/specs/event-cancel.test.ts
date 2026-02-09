import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type SentMessage } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'
import type { SettingsRepo } from '~/storage/repo/settings'

describe('event-cancel', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []
  let container: TestContainer
  let eventRepository: EventRepo
  let eventBusiness: EventBusiness
  let settingsRepository: SettingsRepo

  beforeEach(async () => {
    // Database is automatically cleared by vitest.setup.ts beforeEach hook

    // Create bot and container
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    // Initialize business (registers handlers in transport)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    // Set up mock transformer to intercept all API requests
    sentMessages = mockBot(bot)

    // Resolve repositories
    eventRepository = container.resolve('eventRepository')
    eventBusiness = container.resolve('eventBusiness')
    settingsRepository = container.resolve('settingsRepository')

    // Set up chat_id for announceEvent to work
    await settingsRepository.setSetting('chat_id', String(TEST_CHAT_ID))

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  afterEach(async () => {
    // Clear mock storage after each test
    // Database is automatically cleared by vitest.setup.ts beforeEach hook
    // Clear mock client
    // No cleanup needed
  })

  describe('/event cancel', () => {
    it('should cancel event successfully', async () => {
      // Create event
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      const update = createTextMessageUpdate(`/event cancel ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check success message
      const successMessage = sentMessages.find((msg) =>
        msg.text.includes(`✅ Event ${event.id} cancelled`)
      )
      expect(successMessage).toBeDefined()

      // Check that event status is updated to 'cancelled'
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })

    it('should reject cancel without event ID', async () => {
      const update = createTextMessageUpdate('/event cancel', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check usage message
      const usageMessage = sentMessages.find((msg) => msg.text.includes('Usage: /event cancel'))
      expect(usageMessage).toBeDefined()
    })

    it('should send cancellation notification for announced event', async () => {
      // Create and announce event
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      await eventBusiness.announceEvent(event.id)

      // Clear sent messages from announce
      sentMessages.length = 0

      // Cancel event
      const update = createTextMessageUpdate(`/event cancel ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check success message
      const successMessage = sentMessages.find((msg) =>
        msg.text.includes(`✅ Event ${event.id} cancelled`)
      )
      expect(successMessage).toBeDefined()

      // Check that cancellation notification was sent to main chat
      const notificationMessage = sentMessages.find((msg) =>
        msg.text.includes(`❌ Event ${event.id} has been cancelled.`)
      )
      expect(notificationMessage).toBeDefined()

      // Verify event is cancelled
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })

    it('should not send notification for non-announced event', async () => {
      // Create event without announcing
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      const update = createTextMessageUpdate(`/event cancel ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check success message
      const successMessage = sentMessages.find((msg) =>
        msg.text.includes(`✅ Event ${event.id} cancelled`)
      )
      expect(successMessage).toBeDefined()

      // Check that NO cancellation notification was sent (only success message)
      const cancelMessages = sentMessages.filter((msg) => msg.text.includes('has been cancelled'))
      expect(cancelMessages).toHaveLength(0)

      // Verify event is cancelled
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })
  })
})

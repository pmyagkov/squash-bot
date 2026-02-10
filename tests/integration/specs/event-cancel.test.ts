import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'

describe('event-cancel', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let eventBusiness: EventBusiness

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
    api = mockBot(bot)

    // Resolve repositories
    eventRepository = container.resolve('eventRepository')
    eventBusiness = container.resolve('eventBusiness')

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
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Event ${event.id} cancelled`),
        expect.anything()
      )

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
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Usage: /event cancel'),
        expect.anything()
      )
    })

    it('should send cancellation notification for announced event', async () => {
      // Create and announce event
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      await eventBusiness.announceEvent(event.id)

      // Clear mocks from announce
      api.sendMessage.mockClear()
      api.editMessageText.mockClear()
      api.pinChatMessage.mockClear()
      api.answerCallbackQuery.mockClear()

      // Cancel event
      const update = createTextMessageUpdate(`/event cancel ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check success message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Event ${event.id} cancelled`),
        expect.anything()
      )

      // Check that cancellation notification was sent to main chat
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`❌ Event ${event.id} has been cancelled.`),
        expect.anything()
      )

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
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Event ${event.id} cancelled`),
        expect.anything()
      )

      // Check that NO cancellation notification was sent (only success message)
      const cancelCalls = api.sendMessage.mock.calls.filter(([, text]) => text.includes('has been cancelled'))
      expect(cancelCalls).toHaveLength(0)

      // Verify event is cancelled
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })
  })
})

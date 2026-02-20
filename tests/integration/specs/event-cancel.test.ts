import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

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

  /**
   * Helper: create an event, announce it, return event and messageId
   */
  async function setupAnnouncedEvent(courts = 2) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })

    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    return { event: announcedEvent!, messageId }
  }

  describe('cancel (command)', () => {
    describe('/event cancel', () => {
      it('should cancel event successfully', async () => {
        // Create event
        const event = await eventRepository.createEvent({
          datetime: new Date('2024-01-20T19:00:00'),
          courts: 2,
          status: 'created',
          ownerId: String(ADMIN_ID),
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

      it('should show wizard prompt when no event ID provided', async () => {
        const update = createTextMessageUpdate('/event cancel', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Wizard prompts for event selection
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('Choose an event:'),
          expect.anything()
        )
      })

      it('should send cancellation notification for announced event', async () => {
        // Create and announce event
        const event = await eventRepository.createEvent({
          datetime: new Date('2024-01-20T19:00:00'),
          courts: 2,
          status: 'created',
          ownerId: String(ADMIN_ID),
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
          ownerId: String(ADMIN_ID),
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

  describe('cancel (callback)', () => {
    it('cancels event and changes status to cancelled', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const cancelUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:cancel',
        username: 'admin',
      })

      await bot.handleUpdate(cancelUpdate)

      // Verify event status changed to cancelled
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')

      // Verify logEvent notification was sent
      const logEventCall = api.sendMessage.mock.calls.find(
        ([, text]) => typeof text === 'string' && text.includes('❌ Event cancelled:')
      )
      expect(logEventCall).toBeDefined()
    })

    it('handles cancel on already cancelled event without crashing', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const cancelUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:cancel',
        username: 'admin',
      })

      // Cancel once
      await bot.handleUpdate(cancelUpdate)

      // Cancel again -- should not throw
      await bot.handleUpdate(cancelUpdate)

      // Verify event is still cancelled
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })
  })

  describe('restore (callback)', () => {
    it('restores cancelled event back to announced status', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      // Cancel the event first
      const cancelUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:cancel',
        username: 'admin',
      })

      await bot.handleUpdate(cancelUpdate)

      // Verify event is cancelled
      const cancelledEvent = await eventRepository.findById(event.id)
      expect(cancelledEvent?.status).toBe('cancelled')

      // Restore the event
      const restoreUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:undo-cancel',
        username: 'admin',
      })

      await bot.handleUpdate(restoreUpdate)

      // Verify event status restored to announced
      const restoredEvent = await eventRepository.findById(event.id)
      expect(restoredEvent?.status).toBe('announced')
    })

    it('full flow: announce, cancel, restore preserves event state', async () => {
      const { event, messageId } = await setupAnnouncedEvent(3)

      // Verify initially announced
      const announcedEvent = await eventRepository.findById(event.id)
      expect(announcedEvent?.status).toBe('announced')
      expect(announcedEvent?.courts).toBe(3)

      // Cancel
      const cancelUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:cancel',
        username: 'admin',
      })

      await bot.handleUpdate(cancelUpdate)

      const cancelledEvent = await eventRepository.findById(event.id)
      expect(cancelledEvent?.status).toBe('cancelled')

      // Restore
      const restoreUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:undo-cancel',
        username: 'admin',
      })

      await bot.handleUpdate(restoreUpdate)

      // Verify event is back to announced with original courts preserved
      const restoredEvent = await eventRepository.findById(event.id)
      expect(restoredEvent?.status).toBe('announced')
      expect(restoredEvent?.courts).toBe(3)
    })
  })

  describe('restore (command)', () => {
    it('should restore cancelled event via command', async () => {
      // Create event and announce it
      const { event } = await setupAnnouncedEvent()

      // Cancel the event via repo (set status to 'cancelled')
      await eventRepository.updateEvent(event.id, { status: 'cancelled' })

      // Clear mocks from setup
      api.sendMessage.mockClear()

      // Restore via command
      const update = createTextMessageUpdate(`/event undo-cancel ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)
      await tick()

      // Check bot response
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Restored event'),
        expect.anything()
      )
    })
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'
import type { SettingsRepo } from '~/storage/repo/settings'

describe('event-announce', () => {
  let bot: Bot
  let api: BotApiMock
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
    api = mockBot(bot)

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

  describe('/event announce', () => {
    it('should announce event successfully', async () => {
      // Create event in 'created' status
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      const update = createTextMessageUpdate(`/event announce ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check success message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Event ${event.id} announced`),
        expect.anything()
      )

      // Check that event status is updated to 'announced'
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('announced')

      // Check that telegramMessageId is set
      expect(updatedEvent?.telegramMessageId).toBeDefined()
      expect(updatedEvent?.telegramMessageId).not.toBe('')

      // Check that announcement message was sent to main chat
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('🎾 Squash'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Courts: 2'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Participants:'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('(nobody yet)'),
        expect.anything()
      )

      // Check that message has inline keyboard with "I'm in" and "I'm out" buttons
      const announcementCall = api.sendMessage.mock.calls.find(([, text]) => text.includes('🎾 Squash'))
      expect(announcementCall).toBeDefined()
      const other = announcementCall![2] as Record<string, unknown>
      const replyMarkup = other?.reply_markup as { inline_keyboard: Array<Array<{ text: string }>> }
      expect(replyMarkup?.inline_keyboard).toBeDefined()
      const buttons = replyMarkup.inline_keyboard[0]
      expect(buttons).toHaveLength(2)
      expect(buttons[0].text).toBe("I'm in")
      expect(buttons[1].text).toBe("I'm out")
    })

    it('should reject announce without event ID', async () => {
      const update = createTextMessageUpdate('/event announce', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check usage message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Usage: /event announce'),
        expect.anything()
      )
    })

    it('should reject announce for non-existent event', async () => {
      const update = createTextMessageUpdate('/event announce ev_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Event ev_nonexistent not found'),
        expect.anything()
      )
    })

    it('should handle announce for already announced event', async () => {
      // Create event in 'announced' status
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      // Announce it first time
      await eventBusiness.announceEvent(event.id)

      // Clear sent messages from first announce
      api.sendMessage.mockClear()

      // Try to announce again
      const update = createTextMessageUpdate(`/event announce ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check info message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`ℹ️ Event ${event.id} is already announced`),
        expect.anything()
      )

      // Should not send announcement again (only one message - the info message)
      const calls = api.sendMessage.mock.calls
      const announceMessages = calls.filter((call) => call[1]?.includes('🎾 Squash'))
      expect(announceMessages).toHaveLength(0)
    })

    it('should format announcement message correctly', async () => {
      // Create event with specific date/time
      const eventDateTime = new Date('2024-01-20T19:00:00Z')
      const event = await eventRepository.createEvent({
        datetime: eventDateTime,
        courts: 3,
        status: 'created',
      })

      const update = createTextMessageUpdate(`/event announce ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check announcement message format
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('🎾 Squash'),
        expect.anything()
      )

      // Should include formatted date/time
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/🎾 Squash: \w+, \d+ \w+, \d{2}:\d{2}/),
        expect.anything()
      )

      // Should include number of courts
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Courts: 3'),
        expect.anything()
      )

      // Should include participants section
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Participants:'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('(nobody yet)'),
        expect.anything()
      )
    })
  })
})

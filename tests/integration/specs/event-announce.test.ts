import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type SentMessage } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'
import type { SettingsRepo } from '~/storage/repo/settings'

describe('event-announce', () => {
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
      const successMessage = sentMessages.find((msg) =>
        msg.text.includes(`✅ Event ${event.id} announced`)
      )
      expect(successMessage).toBeDefined()

      // Check that event status is updated to 'announced'
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.status).toBe('announced')

      // Check that telegramMessageId is set
      expect(updatedEvent?.telegramMessageId).toBeDefined()
      expect(updatedEvent?.telegramMessageId).not.toBe('')

      // Check that announcement message was sent to main chat
      const announcementMessage = sentMessages.find(
        (msg) => msg.text.includes('🎾 Squash') && msg.text.includes('Courts: 2')
      )
      expect(announcementMessage).toBeDefined()
      expect(announcementMessage?.text).toContain('Participants:')
      expect(announcementMessage?.text).toContain('(nobody yet)')

      // Check that message has inline keyboard with "I'm in" and "I'm out" buttons
      expect(announcementMessage?.reply_markup).toBeDefined()
      expect(announcementMessage?.reply_markup?.inline_keyboard).toBeDefined()
      const buttons = announcementMessage?.reply_markup?.inline_keyboard[0]
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
      const usageMessage = sentMessages.find((msg) => msg.text.includes('Usage: /event announce'))
      expect(usageMessage).toBeDefined()
    })

    it('should reject announce for non-existent event', async () => {
      const update = createTextMessageUpdate('/event announce ev_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      const errorMessage = sentMessages.find((msg) =>
        msg.text.includes('❌ Event ev_nonexistent not found')
      )
      expect(errorMessage).toBeDefined()
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
      sentMessages.length = 0

      // Try to announce again
      const update = createTextMessageUpdate(`/event announce ${event.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check info message
      const infoMessage = sentMessages.find((msg) =>
        msg.text.includes(`ℹ️ Event ${event.id} is already announced`)
      )
      expect(infoMessage).toBeDefined()

      // Should not send announcement again (only one message - the info message)
      const announceMessages = sentMessages.filter((msg) => msg.text.includes('🎾 Squash'))
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
      const announcementMessage = sentMessages.find((msg) => msg.text.includes('🎾 Squash'))
      expect(announcementMessage).toBeDefined()

      // Should include formatted date/time
      expect(announcementMessage?.text).toMatch(/🎾 Squash: \w+, \d+ \w+, \d{2}:\d{2}/)

      // Should include number of courts
      expect(announcementMessage?.text).toContain('Courts: 3')

      // Should include participants section
      expect(announcementMessage?.text).toContain('Participants:')
      expect(announcementMessage?.text).toContain('(nobody yet)')
    })
  })
})

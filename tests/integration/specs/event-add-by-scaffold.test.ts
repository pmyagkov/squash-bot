import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type SentMessage } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'

describe('event-add-by-scaffold', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []
  let container: TestContainer
  let eventRepository: EventRepo
  let scaffoldRepository: ScaffoldRepo
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
    scaffoldRepository = container.resolve('scaffoldRepository')
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

  describe('/event add-by-scaffold', () => {
    it('should create event from scaffold without auto-announce', async () => {
      // Create a scaffold first
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 3)

      const update = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check that event was created
      const events = await eventRepository.getEvents()
      expect(events.length).toBeGreaterThan(0)
      const createdEvent = events.find((e) => e.scaffoldId === scaffold.id)
      expect(createdEvent).toBeDefined()

      // Verify event properties from scaffold
      expect(createdEvent?.courts).toBe(3) // from scaffold.defaultCourts
      expect(createdEvent?.status).toBe('created') // should NOT be announced automatically
      expect(createdEvent?.scaffoldId).toBe(scaffold.id)

      // Check success message includes announce instruction
      const successMessage = sentMessages.find(
        (msg) => msg.text.includes(`✅ Created event`) && msg.text.includes(scaffold.id)
      )
      expect(successMessage).toBeDefined()
      expect(successMessage?.text).toContain('3 courts')
      expect(successMessage?.text).toContain('To announce: /event announce')

      // Check that NO announcement was sent (no 🎾 Squash message)
      const announcementMessage = sentMessages.find((msg) => msg.text.includes('🎾 Squash'))
      expect(announcementMessage).toBeUndefined()
    })

    it('should reject add-by-scaffold without scaffold ID', async () => {
      const update = createTextMessageUpdate('/event add-by-scaffold', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check usage message
      const usageMessage = sentMessages.find((msg) =>
        msg.text.includes('Usage: /event add-by-scaffold')
      )
      expect(usageMessage).toBeDefined()

      // Check that no event was created
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should reject add-by-scaffold for non-existent scaffold', async () => {
      const update = createTextMessageUpdate('/event add-by-scaffold sc_nonexistent', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      const errorMessage = sentMessages.find((msg) =>
        msg.text.includes('❌ Scaffold sc_nonexistent not found')
      )
      expect(errorMessage).toBeDefined()

      // Check that no event was created
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should reject duplicate event creation', async () => {
      // Create a scaffold
      const scaffold = await scaffoldRepository.createScaffold('Wed', '19:00', 2)

      // Create event first time
      const update1 = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update1)

      // Verify first event was created
      const events1 = await eventRepository.getEvents()
      expect(events1).toHaveLength(1)

      // Clear sent messages
      sentMessages.length = 0

      // Try to create the same event again
      const update2 = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update2)

      // Check error message about duplicate
      const errorMessage = sentMessages.find((msg) => msg.text.includes('❌ Event already exists'))
      expect(errorMessage).toBeDefined()
      expect(errorMessage?.text).toContain(scaffold.id)

      // Check that no additional event was created
      const events2 = await eventRepository.getEvents()
      expect(events2).toHaveLength(1)
    })
  })
})

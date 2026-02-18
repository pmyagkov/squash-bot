import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('event-create-by-scaffold', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let scaffoldRepository: ScaffoldRepo

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
    scaffoldRepository = container.resolve('scaffoldRepository')

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
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Created event`),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(new RegExp(scaffold.id)),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('3 courts'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('To announce: /event announce'),
        expect.anything()
      )

      // Check that NO announcement was sent (no 🎾 Squash message)
      const calls = api.sendMessage.mock.calls
      const announcementCall = calls.find((call) => call[1]?.includes('🎾 Squash'))
      expect(announcementCall).toBeUndefined()
    })

    it('should reject add-by-scaffold without scaffold ID', async () => {
      const update = createTextMessageUpdate('/event add-by-scaffold', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check usage message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Usage: /event add-by-scaffold'),
        expect.anything()
      )

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
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Scaffold sc_nonexistent not found'),
        expect.anything()
      )

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
      api.sendMessage.mockClear()

      // Try to create the same event again
      const update2 = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update2)

      // Check error message about duplicate
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Event already exists'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(new RegExp(scaffold.id)),
        expect.anything()
      )

      // Check that no additional event was created
      const events2 = await eventRepository.getEvents()
      expect(events2).toHaveLength(1)
    })
  })
})

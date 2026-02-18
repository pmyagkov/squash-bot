import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { parseDate } from '~/utils/dateParser'
import { setupFakeTime } from '@integration/helpers/timeHelpers'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { config } from '~/config'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('event-create', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo

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

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  afterEach(async () => {
    // Clear mock storage after each test
    // Database is automatically cleared by vitest.setup.ts beforeEach hook
    // Clear mock client
    // No cleanup needed
  })

  describe('/event create', () => {
    describe('event date parsing formats', () => {
      let bot: Bot
      let api: BotApiMock
      let container: TestContainer
      let eventRepository: EventRepo

      // Set fixed date: Monday, January 15, 2024 at 12:00:00
      // This makes it easy to test relative dates (tomorrow, today, next week)
      const FIXED_DATE = new Date('2024-01-15T12:00:00Z')
      setupFakeTime(FIXED_DATE)

      beforeEach(async () => {
        // Mock Notion API
        // Database is automatically set up by vitest.setup.ts

        // Clear mock storage before each test
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

        // Initialize bot (needed for handleUpdate)
        await bot.init()
      })

      afterEach(async () => {
        // Clear mock storage after each test
        // Database is automatically cleared by vitest.setup.ts beforeEach hook
        // Clear mock client
        // No cleanup needed
      })

      // Helper function to check if event was created successfully
      const checkEventCreated = async (expectedDayOfWeek?: number) => {
        const events = await eventRepository.getEvents()
        expect(events.length).toBeGreaterThan(0)
        const event = events[0]
        expect(event.courts).toBe(2)
        expect(event.status).toBe('created')
        if (expectedDayOfWeek !== undefined) {
          // Use timezone-aware day check (getDay() uses system tz, not Belgrade)
          expect(dayjs.tz(event.datetime, config.timezone).day()).toBe(expectedDayOfWeek)
        }
        return event
      }

      it('should parse absolute date format: 2024-01-20', async () => {
        const update = createTextMessageUpdate('/event create 2024-01-20 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created with correct date
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        expect(event.datetime.getFullYear()).toBe(2024)
        expect(event.datetime.getMonth()).toBe(0) // January (0-indexed)
        expect(event.datetime.getDate()).toBe(20)

        // Check success message format
        const call = api.sendMessage.mock.calls.find(([, text]) =>
          text.includes('✅ Created event')
        )
        expect(call).toBeDefined()
        expect(call![1]).toContain(`✅ Created event ${event.id}`)
        expect(call![1]).toContain('2 courts')
        expect(call![1]).toContain(`To announce: /event announce ${event.id}`)
        // Check message format: should match pattern
        // Format: "✅ Created event ev_xxx (Day DD Mon HH:mm, N courts). To announce: /event announce ev_xxx"
        // Note: nanoid can generate IDs with hyphens and underscores, so we use [\w-]+ instead of \w+
        expect(call![1]).toMatch(
          /^✅ Created event ev_[\w-]+ \([A-Za-z]{3} \d{1,2} [A-Za-z]{3} \d{2}:\d{2}, \d+ courts\)\. To announce: \/event announce ev_[\w-]+$/
        )
      })

      it('should parse relative date: tomorrow', async () => {
        const update = createTextMessageUpdate('/event create tomorrow 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created for tomorrow
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]

        // Calculate expected tomorrow date (January 16, 2024)
        const tomorrow = new Date(FIXED_DATE)
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
        tomorrow.setUTCHours(0, 0, 0, 0)

        const eventDate = new Date(event.datetime)
        eventDate.setUTCHours(0, 0, 0, 0)

        // Should be exactly 1 day difference
        const diffDays = Math.abs(
          (eventDate.getTime() - tomorrow.getTime()) / (1000 * 60 * 60 * 24)
        )
        expect(diffDays).toBe(0)
      })

      it('should parse relative date: today', async () => {
        const update = createTextMessageUpdate('/event create today 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created for today
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        const today = new Date(FIXED_DATE)
        today.setUTCHours(0, 0, 0, 0)

        const eventDate = new Date(event.datetime)
        eventDate.setUTCHours(0, 0, 0, 0)

        // Should be exactly the same day
        const diffDays = Math.abs((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        expect(diffDays).toBe(0)
      })

      it('should parse day name: sat (next Saturday)', async () => {
        const update = createTextMessageUpdate('/event create sat 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(6) // Saturday = 6
        expect(event).toBeDefined()
      })

      it('should parse day name: tue (next Tuesday)', async () => {
        const update = createTextMessageUpdate('/event create tue 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(2) // Tuesday = 2
        expect(event).toBeDefined()
      })

      it('should parse day name: mon (next Monday)', async () => {
        const update = createTextMessageUpdate('/event create mon 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(1) // Monday = 1
        expect(event).toBeDefined()
      })

      it('should parse full day name: monday (next Monday)', async () => {
        const update = createTextMessageUpdate('/event create monday 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(1) // Monday = 1
        expect(event).toBeDefined()
      })

      it('should parse day name: sunday (next Sunday)', async () => {
        const update = createTextMessageUpdate('/event create sun 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(0) // Sunday = 0
        expect(event).toBeDefined()
      })

      it('should parse next week format: next tue', async () => {
        const update = createTextMessageUpdate('/event create next tue 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Tuesday (2 = Tuesday)
        expect(dayjs.tz(event.datetime, config.timezone).day()).toBe(2)

        // Should be exactly 8 days from now (Monday Jan 15 -> next Tuesday Jan 23)
        // Compare calendar days, not time differences
        const now = new Date(FIXED_DATE)
        now.setUTCHours(0, 0, 0, 0)
        const eventDate = new Date(event.datetime)
        eventDate.setUTCHours(0, 0, 0, 0)
        const daysDiff = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        expect(daysDiff).toBe(8)
      })

      it('should parse next week format: next sat', async () => {
        const update = createTextMessageUpdate('/event create next sat 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Saturday (6 = Saturday)
        expect(dayjs.tz(event.datetime, config.timezone).day()).toBe(6)

        // Should be exactly 12 days from now (Monday Jan 15 -> next Saturday Jan 27)
        // Compare calendar days, not time differences
        const now = new Date(FIXED_DATE)
        now.setUTCHours(0, 0, 0, 0)
        const eventDate = new Date(event.datetime)
        eventDate.setUTCHours(0, 0, 0, 0)
        const daysDiff = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        expect(daysDiff).toBe(12)
      })

      it('should parse next week format: next friday', async () => {
        const update = createTextMessageUpdate('/event create next friday 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Friday (5 = Friday)
        expect(dayjs.tz(event.datetime, config.timezone).day()).toBe(5)

        // Should be exactly 11 days from now (Monday Jan 15 -> next Friday Jan 26)
        // Compare calendar days, not time differences
        const now = new Date(FIXED_DATE)
        now.setUTCHours(0, 0, 0, 0)
        const eventDate = new Date(event.datetime)
        eventDate.setUTCHours(0, 0, 0, 0)
        const daysDiff = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        expect(daysDiff).toBe(11)
      })

      it('should reject invalid date format', async () => {
        const update = createTextMessageUpdate('/event create invalid-date-format 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check error message
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('Invalid date format'),
          expect.anything()
        )

        // Check that event is NOT created
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(0)
      })

      it('should reject invalid day name', async () => {
        const update = createTextMessageUpdate('/event create invalidday 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check error message
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('Invalid date format'),
          expect.anything()
        )

        // Check that event is NOT created
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(0)
      })

      it('should handle case-insensitive day names', async () => {
        // First verify that parseDate works with uppercase
        const parsedDate = parseDate('SAT')
        // Use timezone-aware day check (getDay() uses system tz, not Belgrade)
        expect(dayjs.tz(parsedDate, config.timezone).day()).toBe(6) // Saturday = 6

        const update = createTextMessageUpdate('/event create SAT 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created (should work with uppercase)
        const events = await eventRepository.getEvents()
        expect(events.length).toBeGreaterThan(0)
        const event = events[0]
        expect(dayjs.tz(event.datetime, config.timezone).day()).toBe(6) // Saturday = 6
      })

      it('should handle case-insensitive next week format', async () => {
        // First verify that parseDate works with "NEXT TUE" (uppercase)
        const parsedDate = parseDate('NEXT TUE')
        // Use timezone-aware day check (getDay() uses system tz, not Belgrade)
        expect(dayjs.tz(parsedDate, config.timezone).day()).toBe(2) // Tuesday = 2
        // Normalize dates using timezone-aware dayjs to compare calendar days
        const now = dayjs.tz(FIXED_DATE, config.timezone).startOf('day')
        const parsedDateNormalized = dayjs.tz(parsedDate, config.timezone).startOf('day')
        const daysDiff = parsedDateNormalized.diff(now, 'day')
        // Should be exactly 8 days from now
        expect(daysDiff).toBe(8)

        const update = createTextMessageUpdate('/event create NEXT TUE 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created (should work with uppercase)
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Tuesday (2 = Tuesday)
        expect(dayjs.tz(event.datetime, config.timezone).day()).toBe(2)

        // Should be exactly 8 days from now
        const now2 = dayjs.tz(FIXED_DATE, config.timezone).startOf('day')
        const eventDate = dayjs.tz(event.datetime, config.timezone).startOf('day')
        const daysDiff2 = eventDate.diff(now2, 'day')
        expect(daysDiff2).toBe(8)
      })
    })

    it('should validate date format in /event create', async () => {
      const update = createTextMessageUpdate('/event create invalid-date 19:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Invalid date format'),
        expect.anything()
      )

      // Check that event is NOT created
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should validate time format in /event create', async () => {
      const update = createTextMessageUpdate('/event create 2024-01-20 25:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Invalid time format'),
        expect.anything()
      )

      // Check that event is NOT created
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should create event manually via /event create', async () => {
      const update = createTextMessageUpdate('/event create 2024-01-20 19:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        username: 'testadmin',
      })

      await bot.handleUpdate(update)

      // Check that event is created in Notion (via service)
      const events = await eventRepository.getEvents()
      expect(events.length).toBeGreaterThan(0)
      const createdEvent = events[0]
      expect(createdEvent.courts).toBe(2)
      expect(createdEvent.status).toBe('created')
      expect(createdEvent.scaffoldId).toBeUndefined() // Manual event has no scaffoldId

      // Check that bot sent a response with correct format
      expect(api.sendMessage).toHaveBeenCalled()
      const successCall = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes('✅ Created event')
      )
      expect(successCall).toBeDefined()

      // Verify message contains all required parts
      expect(successCall![1]).toContain(`✅ Created event ${createdEvent.id}`)
      expect(successCall![1]).toContain('2 courts')
      expect(successCall![1]).toContain(`To announce: /event announce ${createdEvent.id}`)

      // Check full message format matches expected pattern
      // Format: "✅ Created event ev_xxx (Day DD Mon HH:mm, N courts). To announce: /event announce ev_xxx"
      // Note: nanoid can generate IDs with hyphens and underscores, so we use [\w-]+ instead of \w+
      expect(successCall![1]).toMatch(
        /^✅ Created event ev_[\w-]+ \([A-Za-z]{3} \d{1,2} [A-Za-z]{3} \d{2}:\d{2}, \d+ courts\)\. To announce: \/event announce ev_[\w-]+$/
      )
    })
  })
})

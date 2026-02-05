import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createBot } from '~/bot'
import { eventRepo } from '~/storage/repo/event'
import { scaffoldRepo } from '~/storage/repo/scaffold'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { setBotInstance } from '~/utils/logger'
import { setupMockBotApi, type SentMessage } from '@integration/mocks/botMock'
import { parseDate } from '~/utils/dateParser'
import { setupFakeTime } from '@integration/helpers/timeHelpers'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { config } from '~/config'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('event commands', () => {
  let bot: Bot
  let sentMessages: SentMessage[] = []

  beforeEach(async () => {
    // Database is automatically cleared by vitest.setup.ts beforeEach hook

    // Create bot via createBot (with all commands)
    bot = await createBot()

    // Set up mock transformer to intercept all API requests
    sentMessages = setupMockBotApi(bot)

    // Set bot instance for logger (to avoid errors)
    setBotInstance(bot)

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  afterEach(async () => {
    // Clear mock storage after each test
    // Database is automatically cleared by vitest.setup.ts beforeEach hook
    // Clear mock client
    // No cleanup needed
  })

  describe('/event add', () => {
    describe('event date parsing formats', () => {
      let bot: Bot
      let sentMessages: SentMessage[] = []

      // Set fixed date: Monday, January 15, 2024 at 12:00:00
      // This makes it easy to test relative dates (tomorrow, today, next week)
      const FIXED_DATE = new Date('2024-01-15T12:00:00Z')
      setupFakeTime(FIXED_DATE)

      beforeEach(async () => {
        // Mock Notion API
        // Database is automatically set up by vitest.setup.ts

        // Clear mock storage before each test
        // Database is automatically cleared by vitest.setup.ts beforeEach hook

        // Create bot via createBot (with all commands)
        bot = await createBot()

        // Set up mock transformer to intercept all API requests
        sentMessages = setupMockBotApi(bot)

        // Set bot instance for logger (to avoid errors)
        setBotInstance(bot)

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
        const events = await eventRepo.getEvents()
        expect(events.length).toBeGreaterThan(0)
        const event = events[0]
        expect(event.courts).toBe(2)
        expect(event.status).toBe('created')
        if (expectedDayOfWeek !== undefined) {
          expect(event.datetime.getDay()).toBe(expectedDayOfWeek)
        }
        return event
      }

      it('should parse absolute date format: 2024-01-20', async () => {
        const update = createTextMessageUpdate('/event add 2024-01-20 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created with correct date
        const events = await eventRepo.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        expect(event.datetime.getFullYear()).toBe(2024)
        expect(event.datetime.getMonth()).toBe(0) // January (0-indexed)
        expect(event.datetime.getDate()).toBe(20)

        // Check success message format
        const successMessage = sentMessages.find((msg) => msg.text.includes('✅ Created event'))
        expect(successMessage).toBeDefined()
        expect(successMessage?.text).toContain(`✅ Created event ${event.id}`)
        expect(successMessage?.text).toContain('2 courts')
        expect(successMessage?.text).toContain(`To announce: /event announce ${event.id}`)
        // Check message format: should match pattern
        // Format: "✅ Created event ev_xxx (Day DD Mon HH:mm, N courts). To announce: /event announce ev_xxx"
        // Note: nanoid can generate IDs with hyphens and underscores, so we use [\w-]+ instead of \w+
        expect(successMessage?.text).toMatch(
          /^✅ Created event ev_[\w-]+ \([A-Za-z]{3} \d{1,2} [A-Za-z]{3} \d{2}:\d{2}, \d+ courts\)\. To announce: \/event announce ev_[\w-]+$/
        )
      })

      it('should parse relative date: tomorrow', async () => {
        const update = createTextMessageUpdate('/event add tomorrow 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created for tomorrow
        const events = await eventRepo.getEvents()
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
        const update = createTextMessageUpdate('/event add today 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created for today
        const events = await eventRepo.getEvents()
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
        const update = createTextMessageUpdate('/event add sat 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(6) // Saturday = 6
        expect(event).toBeDefined()
      })

      it('should parse day name: tue (next Tuesday)', async () => {
        const update = createTextMessageUpdate('/event add tue 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(2) // Tuesday = 2
        expect(event).toBeDefined()
      })

      it('should parse day name: mon (next Monday)', async () => {
        const update = createTextMessageUpdate('/event add mon 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(1) // Monday = 1
        expect(event).toBeDefined()
      })

      it('should parse full day name: monday (next Monday)', async () => {
        const update = createTextMessageUpdate('/event add monday 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(1) // Monday = 1
        expect(event).toBeDefined()
      })

      it('should parse day name: sunday (next Sunday)', async () => {
        const update = createTextMessageUpdate('/event add sun 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const event = await checkEventCreated(0) // Sunday = 0
        expect(event).toBeDefined()
      })

      it('should parse next week format: next tue', async () => {
        const update = createTextMessageUpdate('/event add next tue 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const events = await eventRepo.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Tuesday (2 = Tuesday)
        expect(event.datetime.getDay()).toBe(2)

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
        const update = createTextMessageUpdate('/event add next sat 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const events = await eventRepo.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Saturday (6 = Saturday)
        expect(event.datetime.getDay()).toBe(6)

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
        const update = createTextMessageUpdate('/event add next friday 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created
        const events = await eventRepo.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Friday (5 = Friday)
        expect(event.datetime.getDay()).toBe(5)

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
        const update = createTextMessageUpdate('/event add invalid-date-format 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check error message
        const errorMessage = sentMessages.find((msg) => msg.text.includes('Invalid date format'))
        expect(errorMessage).toBeDefined()

        // Check that event is NOT created
        const events = await eventRepo.getEvents()
        expect(events).toHaveLength(0)
      })

      it('should reject invalid day name', async () => {
        const update = createTextMessageUpdate('/event add invalidday 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check error message
        const errorMessage = sentMessages.find((msg) => msg.text.includes('Invalid date format'))
        expect(errorMessage).toBeDefined()

        // Check that event is NOT created
        const events = await eventRepo.getEvents()
        expect(events).toHaveLength(0)
      })

      it('should handle case-insensitive day names', async () => {
        // First verify that parseDate works with uppercase
        const parsedDate = parseDate('SAT')
        expect(parsedDate.getDay()).toBe(6) // Saturday = 6

        const update = createTextMessageUpdate('/event add SAT 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created (should work with uppercase)
        const events = await eventRepo.getEvents()
        expect(events.length).toBeGreaterThan(0)
        const event = events[0]
        expect(event.datetime.getDay()).toBe(6) // Saturday = 6
      })

      it('should handle case-insensitive next week format', async () => {
        // First verify that parseDate works with "NEXT TUE" (uppercase)
        const parsedDate = parseDate('NEXT TUE')
        expect(parsedDate.getDay()).toBe(2) // Tuesday = 2
        // Normalize dates using timezone-aware dayjs to compare calendar days
        const now = dayjs.tz(FIXED_DATE, config.timezone).startOf('day')
        const parsedDateNormalized = dayjs.tz(parsedDate, config.timezone).startOf('day')
        const daysDiff = parsedDateNormalized.diff(now, 'day')
        // Should be exactly 8 days from now
        expect(daysDiff).toBe(8)

        const update = createTextMessageUpdate('/event add NEXT TUE 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check that event is created (should work with uppercase)
        const events = await eventRepo.getEvents()
        expect(events).toHaveLength(1)
        const event = events[0]
        // Should be a Tuesday (2 = Tuesday)
        expect(event.datetime.getDay()).toBe(2)

        // Should be exactly 8 days from now
        const now2 = dayjs.tz(FIXED_DATE, config.timezone).startOf('day')
        const eventDate = dayjs.tz(event.datetime, config.timezone).startOf('day')
        const daysDiff2 = eventDate.diff(now2, 'day')
        expect(daysDiff2).toBe(8)
      })
    })

    it('should validate date format in /event add', async () => {
      const update = createTextMessageUpdate('/event add invalid-date 19:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      const errorMessage = sentMessages.find((msg) => msg.text.includes('Invalid date format'))
      expect(errorMessage).toBeDefined()

      // Check that event is NOT created
      const events = await eventRepo.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should validate time format in /event add', async () => {
      const update = createTextMessageUpdate('/event add 2024-01-20 25:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check error message
      const errorMessage = sentMessages.find((msg) => msg.text.includes('Invalid time format'))
      expect(errorMessage).toBeDefined()

      // Check that event is NOT created
      const events = await eventRepo.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should require all parameters in /event add', async () => {
      const update = createTextMessageUpdate('/event add 2024-01-20 19:00', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check usage message
      const usageMessage = sentMessages.find((msg) => msg.text.includes('Usage: /event add'))
      expect(usageMessage).toBeDefined()

      // Check that event is NOT created
      const events = await eventRepo.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should create event manually via /event add', async () => {
      const update = createTextMessageUpdate('/event add 2024-01-20 19:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        username: 'testadmin',
      })

      await bot.handleUpdate(update)

      // Check that event is created in Notion (via service)
      const events = await eventRepo.getEvents()
      expect(events.length).toBeGreaterThan(0)
      const createdEvent = events[0]
      expect(createdEvent.courts).toBe(2)
      expect(createdEvent.status).toBe('created')
      expect(createdEvent.scaffoldId).toBeUndefined() // Manual event has no scaffoldId

      // Check that bot sent a response with correct format
      expect(sentMessages.length).toBeGreaterThan(0)
      const successMessage = sentMessages.find((msg) => msg.text.includes('✅ Created event'))
      expect(successMessage).toBeDefined()

      // Verify message contains all required parts
      expect(successMessage?.text).toContain(`✅ Created event ${createdEvent.id}`)
      expect(successMessage?.text).toContain('2 courts')
      expect(successMessage?.text).toContain(`To announce: /event announce ${createdEvent.id}`)

      // Check full message format matches expected pattern
      // Format: "✅ Created event ev_xxx (Day DD Mon HH:mm, N courts). To announce: /event announce ev_xxx"
      // Note: nanoid can generate IDs with hyphens and underscores, so we use [\w-]+ instead of \w+
      expect(successMessage?.text).toMatch(
        /^✅ Created event ev_[\w-]+ \([A-Za-z]{3} \d{1,2} [A-Za-z]{3} \d{2}:\d{2}, \d+ courts\)\. To announce: \/event announce ev_[\w-]+$/
      )
    })
  })

  it('should list events via /event list', async () => {
    // First create an event
    const event = await eventRepo.createEvent({
      datetime: new Date('2024-01-20T19:00:00'),
      courts: 2,
      status: 'created',
    })

    const update = createTextMessageUpdate('/event list', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })

    await bot.handleUpdate(update)

    // Check that bot sent list
    expect(sentMessages.length).toBeGreaterThan(0)
    const listMessage = sentMessages.find((msg) => msg.text.includes('📋 Event list'))
    expect(listMessage).toBeDefined()
    expect(listMessage?.text).toContain(event.id)
    expect(listMessage?.text).toContain('created')
  })

  describe('/event announce', () => {
    it('should announce event successfully', async () => {
      // Create event in 'created' status
      const event = await eventRepo.createEvent({
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
      const updatedEvent = await eventRepo.findById(event.id)
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
      const event = await eventRepo.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      // Announce it first time
      await eventRepo.announceEvent(event.id, bot)

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
      const event = await eventRepo.createEvent({
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

  describe('/event add-by-scaffold', () => {
    it('should create event from scaffold without auto-announce', async () => {
      // Create a scaffold first
      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 3)

      const update = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      // Check that event was created
      const events = await eventRepo.getEvents()
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
      const events = await eventRepo.getEvents()
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
      const events = await eventRepo.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should reject duplicate event creation', async () => {
      // Create a scaffold
      const scaffold = await scaffoldRepo.createScaffold('Wed', '19:00', 2)

      // Create event first time
      const update1 = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update1)

      // Verify first event was created
      const events1 = await eventRepo.getEvents()
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
      const errorMessage = sentMessages.find((msg) =>
        msg.text.includes('❌ Event already exists')
      )
      expect(errorMessage).toBeDefined()
      expect(errorMessage?.text).toContain(scaffold.id)

      // Check that no additional event was created
      const events2 = await eventRepo.getEvents()
      expect(events2).toHaveLength(1)
    })
  })

  describe('/event cancel', () => {
    it('should cancel event successfully', async () => {
      // Create event
      const event = await eventRepo.createEvent({
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
      const updatedEvent = await eventRepo.findById(event.id)
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
      const event = await eventRepo.createEvent({
        datetime: new Date('2024-01-20T19:00:00'),
        courts: 2,
        status: 'created',
      })

      await eventRepo.announceEvent(event.id, bot)

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
      const updatedEvent = await eventRepo.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })

    it('should not send notification for non-announced event', async () => {
      // Create event without announcing
      const event = await eventRepo.createEvent({
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
      const updatedEvent = await eventRepo.findById(event.id)
      expect(updatedEvent?.status).toBe('cancelled')
    })
  })
})

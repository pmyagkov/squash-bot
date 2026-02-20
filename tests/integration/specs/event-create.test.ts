import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
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
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { EventBusiness } from '~/business/event'

dayjs.extend(utc)
dayjs.extend(timezone)

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-create', () => {
  describe('manual create', () => {
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
          expect(call![1]).toContain(`✅ Created event <code>${event.id}</code>`)
          expect(call![1]).toContain('🏟 Courts: 2')
          expect(call![1]).toContain(`To announce: /event announce <code>${event.id}</code>`)
          // Check message format: should match pattern
          // Format: "✅ Created event ev_xxx (Day, DD Mon, HH:mm, 🏟 Courts: N). To announce: /event announce ev_xxx"
          // Note: nanoid can generate IDs with hyphens and underscores, so we use [\w-]+ instead of \w+
          expect(call![1]).toMatch(
            /^✅ Created event <code>ev_[\w-]+<\/code> \([A-Za-z]{3}, \d{1,2} [A-Za-z]{3}, \d{2}:\d{2}, 🏟 Courts: \d+\)\. To announce: \/event announce <code>ev_[\w-]+<\/code>$/
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
        expect(successCall![1]).toContain(`✅ Created event <code>${createdEvent.id}</code>`)
        expect(successCall![1]).toContain('🏟 Courts: 2')
        expect(successCall![1]).toContain(`To announce: /event announce <code>${createdEvent.id}</code>`)

        // Check full message format matches expected pattern
        // Format: "✅ Created event ev_xxx (Day, DD Mon, HH:mm, 🏟 Courts: N). To announce: /event announce ev_xxx"
        // Note: nanoid can generate IDs with hyphens and underscores, so we use [\w-]+ instead of \w+
        expect(successCall![1]).toMatch(
          /^✅ Created event <code>ev_[\w-]+<\/code> \([A-Za-z]{3}, \d{1,2} [A-Za-z]{3}, \d{2}:\d{2}, 🏟 Courts: \d+\)\. To announce: \/event announce <code>ev_[\w-]+<\/code>$/
        )
      })
    })
  })

  describe('wizard', () => {
    let bot: Bot
    let api: BotApiMock
    let container: TestContainer

    beforeEach(async () => {
      bot = new Bot('test-token')
      container = createTestContainer(bot)
      container.resolve('eventBusiness').init()
      container.resolve('scaffoldBusiness').init()
      container.resolve('utilityBusiness').init()
      api = mockBot(bot)
      await bot.init()
    })

    describe('/event create (no args) → wizard flow', () => {
      it('event:create is registered in CommandRegistry after init()', () => {
        const registry = container.resolve('commandRegistry')
        expect(registry.get('event:create')).toBeDefined()
      })

      it('full flow: select date → enter time → enter courts → event created', async () => {
        // Compute expected first date option (tomorrow in configured timezone)
        const tz = config.timezone
        const tomorrow = dayjs.tz(new Date(), tz).add(1, 'day')
        const tomorrowValue = tomorrow.format('YYYY-MM-DD')
        const tomorrowLabel = tomorrow.format('ddd D')

        // Step 1: /event create (no args) → wizard starts at dateStep
        const commandDone = bot.handleUpdate(
          createTextMessageUpdate('/event create', {
            userId: ADMIN_ID,
            chatId: TEST_CHAT_ID,
          })
        )
        await tick()

        // Verify date prompt with inline keyboard (dynamic date buttons)
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('Choose a date'),
          expect.objectContaining({
            reply_markup: expect.objectContaining({
              inline_keyboard: expect.arrayContaining([
                expect.arrayContaining([
                  expect.objectContaining({
                    text: tomorrowLabel,
                    callback_data: `wizard:select:${tomorrowValue}`,
                  }),
                ]),
              ]),
            }),
          })
        )

        // Step 2: Select date via callback → timeStep
        api.sendMessage.mockClear()
        await bot.handleUpdate(
          createCallbackQueryUpdate({
            userId: ADMIN_ID,
            chatId: TEST_CHAT_ID,
            messageId: 1,
            data: `wizard:select:${tomorrowValue}`,
          })
        )
        await tick()

        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('Enter time'),
          expect.anything()
        )

        // Step 3: Enter time → courtsStep
        api.sendMessage.mockClear()
        await bot.handleUpdate(
          createTextMessageUpdate('19:00', {
            userId: ADMIN_ID,
            chatId: TEST_CHAT_ID,
          })
        )
        await tick()

        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('Choose number of courts'),
          expect.anything()
        )

        // Step 4: Enter courts → handler runs
        api.sendMessage.mockClear()
        await bot.handleUpdate(
          createTextMessageUpdate('2', {
            userId: ADMIN_ID,
            chatId: TEST_CHAT_ID,
          })
        )

        await commandDone

        // Verify event was created
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('✅ Created event'),
          expect.anything()
        )

        // Verify event exists in database
        const events = await container.resolve('eventRepository').getEvents()
        const created = events.find((e) => e.courts === 2 && e.status === 'created')
        expect(created).toBeDefined()
      })

      it('cancel during wizard → no event created', async () => {
        const commandDone = bot.handleUpdate(
          createTextMessageUpdate('/event create', {
            userId: ADMIN_ID,
            chatId: TEST_CHAT_ID,
          })
        )
        await tick()

        expect(container.resolve('wizardService').isActive(ADMIN_ID)).toBe(true)

        await bot.handleUpdate(
          createCallbackQueryUpdate({
            userId: ADMIN_ID,
            chatId: TEST_CHAT_ID,
            messageId: 1,
            data: 'wizard:cancel',
          })
        )

        await commandDone

        expect(container.resolve('wizardService').isActive(ADMIN_ID)).toBe(false)
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('Cancelled.'),
          expect.anything()
        )

        const events = await container.resolve('eventRepository').getEvents()
        expect(events).toHaveLength(0)
      })
    })

    describe('/event create with all args (skips wizard)', () => {
      it('creates event immediately without wizard prompts', async () => {
        const update = createTextMessageUpdate('/event create tomorrow 19:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('✅ Created event'),
          expect.anything()
        )

        const events = await container.resolve('eventRepository').getEvents()
        expect(events).toHaveLength(1)
        expect(events[0].courts).toBe(2)
        expect(events[0].status).toBe('created')
      })
    })
  })

  describe('spawn from scaffold', () => {
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

    describe('/event spawn', () => {
      it('should create event from scaffold without auto-announce', async () => {
        // Create a scaffold first
        const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 3)

        const update = createTextMessageUpdate(`/event spawn ${scaffold.id}`, {
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
          expect.stringContaining('🏟 Courts: 3'),
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

      it('should show empty message when no scaffold ID provided and no scaffolds exist', async () => {
        const update = createTextMessageUpdate('/event spawn', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Wizard auto-cancels when there are no scaffolds
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('No active scaffolds found.'),
          expect.anything()
        )

        // Check that no event was created
        const events = await eventRepository.getEvents()
        expect(events).toHaveLength(0)
      })

      it('should reject add-by-scaffold for non-existent scaffold', async () => {
        const update = createTextMessageUpdate('/event spawn sc_nonexistent', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })

        await bot.handleUpdate(update)

        // Check error message
        expect(api.sendMessage).toHaveBeenCalledWith(
          TEST_CHAT_ID,
          expect.stringContaining('❌ Scaffold <code>sc_nonexistent</code> not found'),
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
        const update1 = createTextMessageUpdate(`/event spawn ${scaffold.id}`, {
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
        const update2 = createTextMessageUpdate(`/event spawn ${scaffold.id}`, {
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

  describe('auto-create from scaffold', () => {
    let bot: Bot
    let api: BotApiMock
    let container: TestContainer
    let scaffoldRepository: ScaffoldRepo
    let eventRepository: EventRepo
    let settingsRepository: SettingsRepo
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

      // Resolve repositories and business
      scaffoldRepository = container.resolve('scaffoldRepository')
      eventRepository = container.resolve('eventRepository')
      settingsRepository = container.resolve('settingsRepository')
      eventBusiness = container.resolve('eventBusiness')

      // Initialize bot (needed for handleUpdate)
      await bot.init()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should create event from active scaffold when time is due', async () => {
      // Create an active scaffold for Tuesday at 21:00
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)

      // Set announcement deadline to far in advance so it triggers
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      // Use fake time: set to a Monday so next Tuesday is tomorrow
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00')) // Monday 14:00 Belgrade

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(1)

      // Verify event was created
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(1)
      expect(events[0].scaffoldId).toBe(scaffold.id)
      expect(events[0].courts).toBe(2)
    })

    it('should announce created event (status becomes announced)', async () => {
      await scaffoldRepository.createScaffold('Tue', '21:00', 2)
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      await eventBusiness.checkAndCreateEventsFromScaffolds()

      // Verify event status is 'announced' (not just 'created')
      const events = await eventRepository.getEvents()
      expect(events[0].status).toBe('announced')

      // Verify announcement message was sent
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

      // Verify logEvent notification was sent
      const logEventCall = api.sendMessage.mock.calls.find(
        ([, text]) => typeof text === 'string' && text.includes('📅 Event created:')
      )
      expect(logEventCall).toBeDefined()
    })

    it('should skip inactive scaffolds', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)
      await scaffoldRepository.setActive(scaffold.id, false)
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(0)

      // Verify no events created
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should skip if event already exists (duplicate prevention)', async () => {
      const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      // Create first event
      const count1 = await eventBusiness.checkAndCreateEventsFromScaffolds()
      expect(count1).toBe(1)

      // Try again - should skip duplicate
      const count2 = await eventBusiness.checkAndCreateEventsFromScaffolds()
      expect(count2).toBe(0)

      // Verify only one event exists
      const events = await eventRepository.getEvents()
      const scaffoldEvents = events.filter((e) => e.scaffoldId === scaffold.id)
      expect(scaffoldEvents).toHaveLength(1)
    })

    it('should create events for multiple due scaffolds', async () => {
      await scaffoldRepository.createScaffold('Tue', '21:00', 2)
      await scaffoldRepository.createScaffold('Wed', '19:00', 3)
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(2)

      // Verify both events created
      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(2)
    })

    it('should return correct eventsCreated count', async () => {
      await scaffoldRepository.createScaffold('Tue', '21:00', 2)
      await scaffoldRepository.createScaffold('Wed', '19:00', 3)
      // Third scaffold is inactive - should not count
      const inactiveScaffold = await scaffoldRepository.createScaffold('Thu', '20:00', 1)
      await scaffoldRepository.setActive(inactiveScaffold.id, false)

      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()

      // Only 2 active scaffolds should produce events
      expect(count).toBe(2)
    })

    it('should not create event when announcement deadline has not been reached', async () => {
      await scaffoldRepository.createScaffold('Tue', '21:00', 2)

      // Default deadline is "-1d 12:00" (1 day before at 12:00)
      // Set time to 6 days before Tuesday - too early
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-10T10:00:00+01:00')) // Wednesday, 6 days before

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(0)

      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(0)
    })

    it('should return 0 and cause no errors when no active scaffolds exist', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(0)
      expect(api.sendMessage).not.toHaveBeenCalled()

      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(0)
    })
  })
})

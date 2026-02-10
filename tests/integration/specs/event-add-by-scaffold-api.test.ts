import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { TEST_CHAT_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { EventRepo } from '~/storage/repo/event'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { EventBusiness } from '~/business/event'

describe('event-add-by-scaffold-api', () => {
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

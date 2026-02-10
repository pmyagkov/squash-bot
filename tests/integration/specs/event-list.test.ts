import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { SettingsRepo } from '~/storage/repo/settings'

describe('event-list', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
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

  it('should list events via /event list', async () => {
    // First create an event
    const event = await eventRepository.createEvent({
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
    expect(api.sendMessage).toHaveBeenCalled()
    const call = api.sendMessage.mock.calls.find(([, text]) => text.includes('📋 Event list'))
    expect(call).toBeDefined()
    expect(call![1]).toContain(event.id)
    expect(call![1]).toContain('created')
  })
})

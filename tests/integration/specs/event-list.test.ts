import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

describe('event-list', () => {
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

  it('should show owner in event list', async () => {
    const CREATOR_ID = 333333333
    const participantRepo = container.resolve('participantRepository')
    await participantRepo.findOrCreateParticipant(String(CREATOR_ID), 'pasha', 'Pasha')

    await eventRepository.createEvent({
      datetime: new Date('2026-03-01T19:00:00Z'),
      courts: 2,
      ownerId: String(CREATOR_ID),
    })

    const update = createTextMessageUpdate('/event list', {
      userId: CREATOR_ID,
      chatId: TEST_CHAT_ID,
    })
    await bot.handleUpdate(update)

    const listCall = api.sendMessage.mock.calls.find(
      ([, text]) => text.includes('📋 Event list')
    )
    expect(listCall![1]).toContain('👑 @pasha')
  })

  it('should list events via /event list', async () => {
    // First create an event
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00'),
      courts: 2,
      status: 'created',
      ownerId: String(ADMIN_ID),
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

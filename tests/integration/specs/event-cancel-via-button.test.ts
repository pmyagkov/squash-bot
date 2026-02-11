import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'

describe('event-cancel-via-button', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let eventBusiness: EventBusiness

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    // Initialize ALL business classes (registers handlers in transport)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    // Set up mock transformer to intercept all API requests
    api = mockBot(bot)

    // Resolve dependencies
    eventRepository = container.resolve('eventRepository')
    eventBusiness = container.resolve('eventBusiness')

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  /**
   * Helper: create an event, announce it, return event and messageId
   */
  async function setupAnnouncedEvent(courts = 2) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })

    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    return { event: announcedEvent!, messageId }
  }

  it('cancels event and changes status to cancelled', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    const cancelUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:cancel',
      username: 'admin',
    })

    await bot.handleUpdate(cancelUpdate)

    // Verify event status changed to cancelled
    const updatedEvent = await eventRepository.findById(event.id)
    expect(updatedEvent?.status).toBe('cancelled')

    // Verify logEvent notification was sent
    const logEventCall = api.sendMessage.mock.calls.find(
      ([, text]) => typeof text === 'string' && text.includes('❌ Event cancelled:')
    )
    expect(logEventCall).toBeDefined()
  })

  it('handles cancel on already cancelled event without crashing', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    const cancelUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:cancel',
      username: 'admin',
    })

    // Cancel once
    await bot.handleUpdate(cancelUpdate)

    // Cancel again -- should not throw
    await bot.handleUpdate(cancelUpdate)

    // Verify event is still cancelled
    const updatedEvent = await eventRepository.findById(event.id)
    expect(updatedEvent?.status).toBe('cancelled')
  })
})

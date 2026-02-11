import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'

describe('event-restore', () => {
  let bot: Bot
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
    mockBot(bot)

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

  it('restores cancelled event back to announced status', async () => {
    const { event, messageId } = await setupAnnouncedEvent()

    // Cancel the event first
    const cancelUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:cancel',
      username: 'admin',
    })

    await bot.handleUpdate(cancelUpdate)

    // Verify event is cancelled
    const cancelledEvent = await eventRepository.findById(event.id)
    expect(cancelledEvent?.status).toBe('cancelled')

    // Restore the event
    const restoreUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:restore',
      username: 'admin',
    })

    await bot.handleUpdate(restoreUpdate)

    // Verify event status restored to announced
    const restoredEvent = await eventRepository.findById(event.id)
    expect(restoredEvent?.status).toBe('announced')
  })

  it('full flow: announce, cancel, restore preserves event state', async () => {
    const { event, messageId } = await setupAnnouncedEvent(3)

    // Verify initially announced
    const announcedEvent = await eventRepository.findById(event.id)
    expect(announcedEvent?.status).toBe('announced')
    expect(announcedEvent?.courts).toBe(3)

    // Cancel
    const cancelUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:cancel',
      username: 'admin',
    })

    await bot.handleUpdate(cancelUpdate)

    const cancelledEvent = await eventRepository.findById(event.id)
    expect(cancelledEvent?.status).toBe('cancelled')

    // Restore
    const restoreUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:restore',
      username: 'admin',
    })

    await bot.handleUpdate(restoreUpdate)

    // Verify event is back to announced with original courts preserved
    const restoredEvent = await eventRepository.findById(event.id)
    expect(restoredEvent?.status).toBe('announced')
    expect(restoredEvent?.courts).toBe(3)
  })
})

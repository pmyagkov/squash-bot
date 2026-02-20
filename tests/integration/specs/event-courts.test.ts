import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-courts', () => {
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

  describe('callback', () => {
    it('increments court count with +court button', async () => {
      const { event, messageId } = await setupAnnouncedEvent(2)

      const addCourtUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:add-court',
        username: 'admin',
      })

      await bot.handleUpdate(addCourtUpdate)

      // Verify courts incremented from 2 to 3
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.courts).toBe(3)
    })

    it('decrements court count with -court button', async () => {
      const { event, messageId } = await setupAnnouncedEvent(3)

      const rmCourtUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:remove-court',
        username: 'admin',
      })

      await bot.handleUpdate(rmCourtUpdate)

      // Verify courts decremented from 3 to 2
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.courts).toBe(2)
    })

    it('cannot go below 1 court', async () => {
      const { event, messageId } = await setupAnnouncedEvent(1)

      const rmCourtUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:remove-court',
        username: 'admin',
      })

      await bot.handleUpdate(rmCourtUpdate)

      // Verify courts remains at 1 (minimum)
      const updatedEvent = await eventRepository.findById(event.id)
      expect(updatedEvent?.courts).toBe(1)
    })
  })

  describe('command', () => {
    it('should add court via command', async () => {
      const { event } = await setupAnnouncedEvent(2)

      await bot.handleUpdate(
        createTextMessageUpdate(`/event add-court ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Added court'),
        expect.anything()
      )
    })

    it('should remove court via command', async () => {
      const { event } = await setupAnnouncedEvent(3)

      await bot.handleUpdate(
        createTextMessageUpdate(`/event remove-court ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Removed court'),
        expect.anything()
      )
    })

    it('should reject removing last court via command', async () => {
      const { event } = await setupAnnouncedEvent(1)

      await bot.handleUpdate(
        createTextMessageUpdate(`/event remove-court ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Cannot remove last court'),
        expect.anything()
      )
    })
  })
})
